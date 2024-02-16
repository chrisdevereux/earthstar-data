import type { AuthorKeypair, DocEs5, Replica } from "earthstar"
import { LiveQuery } from "./live"
import { splitPath } from "./util"

export interface ReadProps {
  replica: Replica
  path: string
}

export interface ReduceProps<T> {
  replica: Replica
  pathComponents: string[]
  requestedPath: string
  prev: T | null
  doc: DocEs5
}

export interface WriteProps<T> {
  replica: Replica,
  author: AuthorKeypair,
  path: string
  data: T | null
}

export type Awaitable<T> = T | Promise<T>

export abstract class EsType<ReadT = unknown, WriteT = ReadT> {
  _phantom?: { write: WriteT, read: ReadT }

  abstract reduce(props: ReduceProps<ReadT>): Awaitable<ReadT | null>;
  abstract write(data: WriteProps<WriteT>): Promise<void>;

  async read({ replica, path }: ReadProps) {
    const contentsPrefix = this.getContentPrefix(path)

    const [root, contents] = await Promise.all([
      replica.getLatestDocAtPath(contentsPrefix.replace(/\/$/, '')),
      replica.queryDocs({
        filter: {
          pathStartsWith: contentsPrefix
        }
      }),
    ])

    let result: ReadT | null = null

    for (const doc of [root, ...contents]) {
      if (!doc) {
        continue
      }

      result = await this.reduce({
        doc,
        prev: result,
        replica,
        pathComponents: splitPath(doc.path.substring(contentsPrefix.length)),
        requestedPath: path
      })
    }

    return result
  }

  async observe({ path, replica }: ReadProps): Promise<LiveQuery<ReadT>> {
    const contentPrefix = this.getContentPrefix(path)
    const initial = await this.read({ path: contentPrefix, replica })
    return new LiveQuery<ReadT>(this, contentPrefix, path, replica, initial)
  }

  getContentPrefix(path: string) {
    return path.endsWith('/') ? path + '/' : path
  }
}

export type TypeOf<T> =
  T extends EsType<any>
  ? NonNullable<T['_phantom']>['read']
  : never


export type OutputTypeOf<T> =
  T extends EsType<any>
  ? NonNullable<T['_phantom']>['write']
  : never
