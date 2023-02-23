import { EsType, ReduceProps, WriteProps } from "./types"
import { requireWriteSuccess } from "./util"

/**
 * Convenience for defining an atomic value type (stored in a single document).
 */
export class Atom<T> extends EsType<T> {
  constructor(private codec: { encode: (x: T) => string, decode: (x: string) => T }) {
    super()
  }

  reduce({ doc }: ReduceProps<T>): T | null {
    if (doc.text === '') {
      return null
    }

    return this.codec.decode(doc.text)
  }

  async write({ replica, data, author, path }: WriteProps<T>): Promise<void> {
    requireWriteSuccess(
      await replica.set(author, {
        path,
        text: data === null
          ? ''
          : this.codec.encode(data)
      })
    )
  }
}

/**
 * String value type. Stored in the doc as a simple plain-text string value
 */
export const string = new Atom<string>({
  encode: x => x,
  decode: x => x,
})

/**
 * Number value type. Stored in the doc as the decimal text representation of the number
 */
export const number = new Atom<number>({
  encode: String,
  decode: Number
})

/**
 * Arbitrary-sized int value type. Stored in the doc as the decimal text representation of the number.
 */
export const bigint = new Atom<bigint>({
  encode: String,
  decode: BigInt
})

/**
 * Boolean value type. Stored in the doc as the string '1' or '0'.
 */
export const boolean = new Atom<boolean>({
  encode: x => x ? '1' : '0',
  decode: x => x === '1'
})


/**
 * Date value type. Stored as an iso-formatted date-time string
 */
export const datetime = new Atom<Date>({
  encode: x => x.toISOString(),
  decode: x => new Date(x)
})
