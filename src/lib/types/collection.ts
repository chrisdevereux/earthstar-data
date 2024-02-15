import type { QueryFilter, Replica } from "earthstar";
import { Atom } from "./atoms";
import { isEmptyObject, wipeDocsUnderPath } from "../util";
import { EsType, ReduceProps, WriteProps } from "../type";

/**
 * Dictionary type mapping string keys (stored as a url-encoded component in the path) to a common inner value type.
 * 
 * Writes are partial updates, so keys not included in the data parameter won't be touched.
 * You can remove a key by setting it to undefined.
 */
class CollectionType<T> extends EsType<Record<string, T | undefined>, Record<string, T | null>> {
  constructor(readonly valueType: EsType<T>) {
    super()
  }

  async reduce({ replica, doc, prev, pathComponents: [rawKey, ...remainingPath] }: ReduceProps<Record<string, T | undefined>>): Promise<Record<string, T | undefined> | null> {
    const key = decodeURIComponent(rawKey)

    if (!doc.text) {
      const next = Object.assign({}, prev)
      delete next[key]

      if (isEmptyObject(next)) {
        return null
      }

      return next

    } else {
      const inner = await this.valueType.reduce({
        doc,
        prev: prev?.[key] ?? null,
        pathComponents: remainingPath,
        replica
      })

      if (inner === null) {
        const next = Object.assign({}, prev)
        delete next[key]

        if (isEmptyObject(next)) {
          return null
        }

        return next
      }

      return {
        ...prev,
        [key]: inner
      }
    }
  }

  async write({ data, replica, author, path }: WriteProps<Record<string, T | null>>): Promise<void> {
    if (!data) {
      return wipeDocsUnderPath(replica, author, path)
    }

    const innerOps = Object.entries(data).map(([key, val]) => {
      const rawKey = encodeURIComponent(key)
      return this.valueType.write({
        data: val,
        author,
        path: path + '/' + rawKey,
        replica
      })
    })

    await Promise.all(innerOps);
  }
}

/**
 * A set maps string keys to a value type. Keys are stored urlencoded at the end of the document path.
 * 
 * We can use this to model relationships to other objects:
 *
 * ``` 
 * const Post = object({
 *   content: string,
 *   title: string,
 *   readNext: set,
 * });
 * 
 * await Post.write({
 *   author: me,
 *   replica: myReplica,
 *   path: "/posts/2",
 *   data: {
 *     readNext: {
 *       "/posts/1": true,
 *    },
 *   },
 * });
 * ```
 */
export const set = new CollectionType(new Atom<true>({
  encode: x => x ? '1' : '',
  decode: () => true
}))

/**
 * A dict maps string keys to a value type. Keys are stored url-encoded in the document path. Values are stored in
 * subpaths scoped by the keys.
 * 
 * We can use this to model collections of embedded objects.
 * 
 * It can also be useful for modelling relationships between objects when we want to include some contextual 
 * information about the relationship that doesn't belong in the linked object.
 * 
 * @param valueSchema Schema for the dictionary's value types.
 */
export function dict<T>(valueSchema: EsType<T>) {
  return new CollectionType<T>(valueSchema)
}

interface FindByCollectionKeyOpts {
  /** Replica to search for related objects */
  replica: Replica

  /** 
   * If provided, paths returned will be to a parent object of the collection rather than the collection itself.
   * 
   * For example, if we search for keys in the `readNext` property of a type `Post` that looks like this:
   * 
   * ```
   * const Post = object({
   *   content: string,
   *   title: string,
   *   readNext: set,
   * });
   * ```
   * 
   * then leaving this blank will return paths like `/posts/1/readNext`. If this is set to `/readNext`, we'll instead
   * get paths like `/posts/1`, which is generally what you want when finding the inverse a relationship.
   * 
   * If not provided, the returned paths will be paths to the collection.
   **/
  collectionPrefix?: string

  /** 
   * Any additional filters you want to add to the query.
   * 
   * You probably want to include a path prefix here if all of the relevant docs exist under a particular path
   **/
  filter?: Omit<QueryFilter, 'pathEndsWith'>
}

/**
 * Searches a replica for collections (or objects containing collections) that contain a given key.
 * 
 * This is useful for finding the inverse of a relationship.
 *
 * ```typescript
 * const Post = object({
 *   content: string,
 *   title: string,
 *   readNext: set,
 * });
 * 
 * const readBeforePost1 = await findByCollectionKey("/posts/1", {
 *   collectionPrefix: "/readNext",
 *   replica: myReplica,
 *   filter: {
 *     pathStartsWith: "/posts",
 *   },
 * });
 * ```
 */
export async function findByCollectionKey(key: string, opts: FindByCollectionKeyOpts) {
  const pathEnding = opts.collectionPrefix + '/' + encodeURIComponent(key)

  const relationPaths = await opts.replica.queryPaths({
    filter: {
      ...opts.filter,
      pathEndsWith: pathEnding
    }
  })

  return relationPaths.map(path => path.slice(0, path.length - pathEnding.length))
}