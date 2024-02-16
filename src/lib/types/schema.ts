import { Awaitable, EsType, OutputTypeOf, ReadProps, ReduceProps, TypeOf, WriteProps } from "../type";
import { splitPath } from "../util";

export interface ApplicationFormat {
  namespace: string
  major: number,
  minor: number
}

export interface SchemaOpts {
  format: ApplicationFormat
  prefix?: string
}

export function appFormat<InnerT extends EsType<any, any>>(schema: InnerT, { prefix, format, }: SchemaOpts) {
  return new AppFormatType<
    TypeOf<InnerT>,
    OutputTypeOf<InnerT>,
    InnerT
  >(schema, format, prefix)
}

export class AppFormatType<ReadT, WriteT, InnerT extends EsType<ReadT, WriteT>> extends EsType<ReadT, WriteT> {
  private schemaParts: string[] = []

  constructor(
    readonly schema: InnerT,
    readonly format: ApplicationFormat,
    readonly prefix: string = '',
  ) {
    super()
  }

  reduce({ pathComponents: [minorVersionStr, ...restPath], ...rest }: ReduceProps<ReadT>): Awaitable<ReadT | null> {
    const minorVersion = Number(minorVersionStr)
    if (!isNaN(minorVersion) && minorVersion > this.format.minor) {
      return rest.prev
    }

    const iterRest = restPath[Symbol.iterator]()

    for (const prefixComponent of splitPath(this.prefix)) {
      const item = iterRest.next()
      if (item.done || item.value !== prefixComponent) {
        return rest.prev
      }
    }

    return this.schema.reduce({
      pathComponents: Array.from(iterRest),
      ...rest
    })
  }

  write(data: WriteProps<WriteT>): Promise<void> {
    const path = [
      ...splitPath(this.prefix),
      ...splitPath(data.path)
    ].join('/')

    return this.schema.write({
      ...data,
      path: `/${this.format.namespace}/${this.format.major}.${this.format.minor}/${path}`
    })
  }

  getContentPrefix(): string {
    return `/${this.format.namespace}/${this.format.major}.`
  }
}