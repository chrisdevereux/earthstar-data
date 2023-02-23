import { EsType, ReduceProps, TypeOf, WriteProps } from "./types"
import { isEmptyObject, NullableValues, wipeDocsUnderPath } from "./util"

type ShapeDef = Record<string, EsType | undefined>
type WrittenProps<T> = Partial<NullableValues<T>>

type ShapeType<Shape> = Partial<{
  [P in keyof Shape]: TypeOf<Shape[P]>
}>

// Use this to reference the root document of the object
const SELF_SIGIL = '@self'

/**
 * Declare an object (aka struct/record) type.
 * 
 * ## Example:
 * 
 * ```
 * const Post = object({
 *   title: string,
 *   content: string
 * })
 * ```
 * 
 * @param shape Map of keys to value type
 * @returns an ObjectType, which you can use to read and write object types
 */
export function object<Shape>(shape: Shape) {
  return new ObjectType<ShapeType<Shape>>(shape as ShapeDef)
}

/**
 * Object type
 * 
 * Stores key/value pairs by mapping the keys onto document paths and writing the paths.
 */
export class ObjectType<T> extends EsType<T, WrittenProps<T>> {
  constructor(private shape: ShapeDef) {
    super()
  }

  async reduce({
    doc, prev, replica, pathComponents: [attrKey = SELF_SIGIL, ...remainingPath]
  }: ReduceProps<T>): Promise<T | null> {
    const attrSchema = this.shape[attrKey]

    if (!attrSchema) {
      return prev
    }

    const val = await attrSchema.reduce({
      doc,
      prev: (prev as any)?.[attrKey],
      replica,
      pathComponents: remainingPath
    })

    if (val === null) {
      const next: any = Object.assign({}, prev ?? {})
      delete next[attrKey]

      if (isEmptyObject(next)) {
        return null
      }

      return next
    }

    return {
      ...prev,
      [attrKey]: val
    } as T
  }

  async write({ replica, author, path, data }: WriteProps<WrittenProps<T>>): Promise<void> {
    if (data === null) {
      return wipeDocsUnderPath(replica, author, path)
    }

    const subpathOperations = Object.entries(this.shape)
      .map(([key, attr]) => {
        if (!attr) {
          return
        }


        if (data && data[key as keyof T] !== undefined) {
          const nextPath =
            key === SELF_SIGIL ? path : path + '/' + key

          return attr.write({
            path: nextPath,
            author,
            data: (data as any)[key],
            replica
          })
        }
      })

    await Promise.all(subpathOperations)
  }
}
