import type { DocBase, DocEs5, Replica, ReplicaEvent } from "earthstar"
import { EsType } from "./type"
import { splitPath } from "./util"

export class LiveQuery<T> {
  private replicaEvents?: ReadableStreamDefaultReader<ReplicaEvent<DocBase<string>>>
  private observers = new Set<() => void>()
  private rootPath

  constructor(private schema: EsType<T, unknown>, readonly contentPrefix: string, readonly requestedPath: string, private replica: Replica, private value: T | null) {
    this.run()
    this.rootPath = contentPrefix.replace(/\/$/, '')
  }

  snapshot() {
    return this.value
  }

  subscribe(
    onChange?: (value: T | null) => void,
  ) {
    const observer = () => onChange?.(this.value)

    this.observers.add(observer)

    if (this.isClosed) {
      this.run()
    }

    return async () => {
      this.observers.delete(observer)

      if (this.observers.size === 0) {
        await this.close()
      }
    }
  }

  get isClosed() {
    return !this.replicaEvents
  }

  async close() {
    this.observers.clear()
    await this.replicaEvents?.cancel()
    this.replicaEvents = undefined
  }

  private async run() {
    if (this.replicaEvents) {
      throw Error('Attempting to start liveQuery while already active')
    }

    this.replicaEvents = this.replica.getEventStream().getReader() as any

    while (this.replicaEvents) {
      const msg = await this.replicaEvents.read()
      if (msg.done) {
        return
      }

      const event = msg.value

      if (event.kind === 'success' || event.kind === 'expire') {
        if (event.doc.format !== 'es.5') {
          return
        }

        const doc = event.doc as DocEs5
        await this.handleDoc(doc)
      }
    }
  }

  private async handleDoc(doc: DocEs5) {
    if (doc.path !== this.rootPath && !doc.path.startsWith(this.contentPrefix)) {
      return
    }

    this.value = await this.schema.reduce({
      doc,
      pathComponents: splitPath(doc.path.substring(this.contentPrefix.length)),
      prev: this.value,
      replica: this.replica,
      requestedPath: this.requestedPath
    })

    this.observers.forEach(o => o())
  }
}
