import { EsType, boolean, number, object, string, datetime, bigint, set, dict, findByCollectionKey, metadata, docSlug, docPath } from '../src'
import { expect, test, vitest } from 'vitest'
import { Crypto, isErr, Replica, ReplicaDriverMemory } from 'earthstar'
import { blob } from '../src/lib/types/attachment'

test('objects are read back', async () => {
  const ObjectType = object({
    '@self': string,
    title: string
  })

  await testValuesAreReadBack(ObjectType, {
    '@self': 'Me',
    title: 'hello'
  })
})

test('partial objects are read back', async () => {
  const schema = object({
    '@self': string,
    title: string,
    description: string
  })

  await testValuesAreReadBack(schema, {
    '@self': 'Me',
    title: 'hello'
  })
})

test('nested objects are read back', async () => {
  const schema = object({
    '@self': string,
    metadata: object({
      description: string
    })
  })

  await testValuesAreReadBack(schema, {
    '@self': 'Me',
    metadata: {
      description: 'This uses a nested object'
    }
  })
})

test('objects can be deleted by setting to null', async () => {
  const { replica, author } = await setup()
  const schema = object({
    '@self': string,
    title: string
  })

  await schema.write({
    author,
    replica,
    data: {
      "@self": 'hello',
      title: 'SomeObject'
    },
    path: '/someObject'
  })

  await schema.write({
    author,
    replica,
    data: null,
    path: '/someObject'
  })

  expect(
    await schema.read({ path: '/someObject', replica })
  ).toBeNull()
})

test('object keys can be removed by setting to null', async () => {
  const { replica, author } = await setup()
  const schema = object({
    '@self': string,
    title: string
  })

  await schema.write({
    author,
    replica,
    data: {
      "@self": 'hello',
      title: 'SomeObject'
    },
    path: '/someObject'
  })

  await schema.write({
    author,
    replica,
    data: {
      "@self": null,
    },
    path: '/someObject'
  })

  expect(
    await schema.read({ path: '/someObject', replica })
  ).toEqual({
    title: 'SomeObject'
  })
})

test('objects are observed for changes', async () => {
  const { replica, author } = await setup()
  const observer = vitest.fn()

  const schema = object({
    '@self': string,
    title: string
  })

  await schema.write({
    author,
    replica,
    data: {
      "@self": 'hello',
      title: 'SomeObject'
    },
    path: '/someObject'
  })

  const live = await schema.observe({ path: '/someObject', replica })
  const unsubscribe = live.subscribe(observer)

  await schema.write({
    author,
    replica,
    data: {
      title: 'changed'
    },
    path: '/someObject'
  })

  expect(live.isClosed).toBeFalsy()
  expect(live.snapshot()).toEqual({
    "@self": 'hello',
    title: 'changed'
  })
  expect(observer).toHaveBeenCalledWith({
    "@self": 'hello',
    title: 'changed'
  })

  await unsubscribe()
  expect(live.isClosed).toBeTruthy()
})

test('sets are read back', async () => {
  await testValuesAreReadBack(set, { '1': true })
})

test('dicts are read back', async () => {
  const objectType = object({
    dictProp: string
  })

  await testValuesAreReadBack(dict(objectType), { 'a': { dictProp: '1' } })
})

test('findByCollectionKey returns linked keys', async () => {
  const { replica, author } = await setup()

  const Post = object({
    title: string,
    related: set
  })

  await Post.write({
    replica,
    author,
    path: '/posts/1',
    data: {}
  })

  await Post.write({
    replica,
    author,
    path: '/posts/2',
    data: {
      related: {
        '/posts/1': true
      }
    }
  })

  await Post.write({
    replica,
    author,
    path: '/posts/3',
    data: {
      related: {
        '/posts/1': true
      }
    }
  })

  const posts = await findByCollectionKey('/posts/1', {
    replica,
    collectionPrefix: '/related',
    filter: {
      pathStartsWith: '/posts/'
    }
  })

  expect(posts).toEqual([
    '/posts/2',
    '/posts/3'
  ])
})

test('numbers are read back', async () => {
  await testValuesAreReadBack(number, 12)
  await testValuesAreReadBack(number, 0)
})

test('strings are read back', async () => {
  await testValuesAreReadBack(string, 'hello')
})

test('bigints are read back', async () => {
  await testValuesAreReadBack(bigint, BigInt('1000000000000000000000000000'))
})

test('booleans are read back', async () => {
  await testValuesAreReadBack(boolean, true)
  await testValuesAreReadBack(boolean, false)
})

test('date-times are read back', async () => {
  await testValuesAreReadBack(datetime, new Date())
})

test('blobs (and therefore attachments more generally) are read back', async () => {
  await testValuesAreReadBack(blob, new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }), {
    path: '/images/my-image.png'
  })
})

test('metadata is read back', async () => {
  const { replica, author } = await setup()
  
  const type = object({
    '@self': metadata({
      slug: docSlug,
      path: docPath,
      docContent: string
    })
  })

  await string.write({
    replica,
    author,
    path: '/objects/1',
    data: 'hello'
  })
  
  expect(
    await type.read({ replica, path: '/objects/1' })
  ).toEqual({
    '@self': {
      slug: '1',
      path: '/objects/1',
      docContent: 'hello'
    }
  })
})

async function testValuesAreReadBack<R, W>(schema: EsType<R, W>, example: W, opts?: { path: string }) {
  const { replica, author } = await setup()
  await schema.write({
    replica,
    author,
    data: example,
    path: opts?.path ?? '/someObject'
  })

  expect(
    await schema.read({ path: opts?.path ??'/someObject', replica })
  ).toEqual(example)
}

async function setup() {
  const author = await Crypto.generateAuthorKeypair('test')
  if (isErr(author)) {
    throw author
  }

  const share = await Crypto.generateShareKeypair('tetst')
  if (isErr(share)) {
    throw share
  }

  return {
    author,
    replica: new Replica({
      shareSecret: share.secret,
      driver: new ReplicaDriverMemory(share.shareAddress)
    })
  }
}
