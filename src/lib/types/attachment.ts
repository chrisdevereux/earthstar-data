import type { DocAttachment } from "earthstar";
import { EsType, ReduceProps, WriteProps } from "../type";
import { requireWriteSuccess } from "../util";

interface WritableAttachment {
  metadata: string
  attachment: Uint8Array | ReadableStream<Uint8Array>
}

interface ReadableAttachment {
  metadata: string
  attachment: DocAttachment
}

export class AttachmentType extends EsType<ReadableAttachment, WritableAttachment> {
  async reduce({ doc, replica }: ReduceProps<ReadableAttachment>): Promise<ReadableAttachment | null> {
    const attachment = await replica.getAttachment(doc);
    if (attachment instanceof Error) {
      throw attachment;
    }

    if (!attachment) {
      return null
    }

    return {
      metadata: doc.text,
      attachment
    }
  }

  async write({ author, replica, path, data }: WriteProps<WritableAttachment>): Promise<void> {
    if (!data) {
      await replica.wipeDocAtPath(author, path)
      return
    }

    requireWriteSuccess(
      await replica.set(author, {
        path,
        attachment: data?.attachment as any,
        text: data.metadata
      })
    )
  }
}

class BlobAttachmentType extends EsType<Blob> {
  inner = new AttachmentType()

  async reduce(props: ReduceProps<Blob>): Promise<Blob | null> {
    const attachment = await this.inner.reduce({
      ...props,
      prev: null
    })
    return attachment && new Blob([await attachment.attachment.bytes()], { type: attachment.metadata })
  }

  async write({ author, replica, path, data }: WriteProps<Blob>): Promise<void> {
    await this.inner.write({ author, replica, path, data: data && { attachment: data.stream(), metadata: data.type } })
  }
}

export const attachment = new AttachmentType()
export const blob = new BlobAttachmentType()
