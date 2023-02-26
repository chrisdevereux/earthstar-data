import { EsType, ReduceProps, TypeOf } from "../type";

type ShapeType<Shape> = Partial<{
  [P in keyof Shape]: TypeOf<Shape[P]>
}>

export class MetadataType<T> extends EsType<T, never> {
  constructor(readonly reduce: (props: ReduceProps<T>) => T) {
    super()
  }

  write(): Promise<void> {
    throw Error(`Attempted to write to a read-only metadata value`)
  }
}

/**
 * Read-only. Combine several read-only properties from the same underlying document.
 */
export function metadata<Shape>(shape: Shape) {
  return new MetadataType<ShapeType<Shape>>((props) => {
    return Object.fromEntries(
      Object.entries(shape as Record<string, EsType>).map(([key, type]) => [key, type.reduce(props)])
    ) as ShapeType<Shape>
  })
}

/**
 * Read-only. Return the last path component of the document
 */
export const docSlug = new MetadataType<string>(({ doc }) => {
  const path = doc.path.split('/')
  return path[path.length - 1]
})

/**
 * Read-only. Return the path of the document
 */
export const docPath = new MetadataType<string>(({ doc }) => {
  return doc.path
})
