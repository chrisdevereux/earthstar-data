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
    const contentsPrefix = path + '/'
    const [root, contents] = await Promise.all([
      replica.getLatestDocAtPath(path),
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
        pathComponents: splitPath(doc.path.substring(path.length))
      })
    }

    return result
  }

  async observe({ path, replica }: ReadProps): Promise<LiveQuery<ReadT>> {
    const initial = await this.read({ path, replica })
    return new LiveQuery<ReadT>(this, path, replica, initial)
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
