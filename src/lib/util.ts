import { AuthorKeypair, DocBase, IngestEvent, Replica } from "earthstar";

export type NullableValues<T> = { [P in keyof Required<T>]: T[P] | null }

export function requireWriteSuccess(event: IngestEvent<DocBase<string>>) {
  if (event.kind === 'failure') {
    throw event.err ?? new Error(event.reason)
  }
}

export function splitPath(path: string) {
  return path.split('/').filter(Boolean)
}

export function isEmptyObject(object: any) {
  for (const _ in object) {
    return false
  }
  return true
}

export async function wipeDocsUnderPath(replica: Replica, identity: AuthorKeypair, path: string) {
  const subpaths = await replica.queryPaths({
    filter: {
      pathStartsWith: path + '/'
    }
  })

  await Promise.all([
    ...subpaths.map(path => replica.wipeDocAtPath(identity, path)),
    replica.wipeDocAtPath(identity, path)
  ])
}