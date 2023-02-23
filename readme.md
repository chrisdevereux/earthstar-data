# earthstar-data

Data structures for earthstar. Makes it easier to:

- Store structured data with granular documents so that they can be concurrently edited from multiple devices.
- Model relationships easily
- Easily encode and decode js types to text-based representations and binary attachments
- Represent values stored in earthstar using the correct Typescript type (if you like Typescript)

You might think of it as roughly fulfilling the role as that an ORM does in a relational database. Or at least in the sense of providing a higher-level wrapper that makes it easy to do slightly more complex things with data.

## Usage

The overall idea is that we define a schema for types using a similar API to validation APIs like [yup](https://github.com/jquense/yup) and then use that to read and write to the replica rather than the replica directly.

Let's try it out by modelling a `Post` type:

```typescript
const Post = object({
  content: string,
  title: string,
});
```

Now we can use this to write documents to a share:

```typescript
await Post.write({
  replica: myReplica,
  author: me,
  path: "/posts/hello",
  data: {
    title: "Hello, world",
    content: "This is an example post",
  },
});
```

This will cause in the following documents to be written:

```
/posts/hello/title -> Hello, world
/posts/hello/content -> This is an example post
```

We can now read the `Post` object we just created from the share:

```typescript
const myPost = await Post.read({
  path: "/posts/hello",
  replica: myReplica,
});
```

...or observe it for changes...

```typescript
const myPost$ = Post.observe({
  path: "/posts/hello",
});

myPost$.subscribe((myPost) => {
  console.log(myPost);
});
```

## Internals

Types are defined by implementing two methods on the abstract `EsType` class. There are a bunch of useful types already built in, but it's worth understanding how they work even if you don't need to write your own. A type needs to implement two methods:

```typescript
class MyCustomType {
  reduce({
    // Document we're reading
    doc: DocEs5

    // Subpath components from the requested path to `doc`
    pathComponents: string[]

    // Replica we're reading from
    replica: Replica

    // Previous value returned from reduce() or undefined if this is the first invocation
    prev: T | undefined
  }): T | undefined | Promise<T | undefined> {
    ...
  }

  write({
    // Replica we're writing to
    replica: Replica,

    // Author identity used to write documents
    author: AuthorKeypair,

    // Path of the current written value
    path: string

    // Data to be written to the current path
    data: T | undefined
  }): Promise<void> {
    ...
  }
}
```

You can extend the `Atom` class for simple atomic types that map one-one onto a document's text content. See the source for examples.

### reduce()

When you call `Post.read()` in the example above, the replica is queried for both the requested path and all subpaths. These are fed one-by-one fed into the `reduce()` method along with its previous return value (starting with null). Each invocation progressively builds up the full object from the data in each document. If you've ever used redux or Elm, you might be familiar with this sort of approach.

For a simple, atomic type that doesn't have much of an internal structure, the reduce method will be very simple. It will simply grab some text from a document (or binary data from its attachment), possibly doing a conversion on the text and return it, ignoring the previous value.

For a more complex type, the reducer will recursively call into inner types to merge data extracted from the document from the last known value to add or remove data from it.

Using a reducer here means that we can fetch all the documents from the replica in one go and also listen for more granular changes to data than we would have otherwise, which makes observing documents (or big collections of data) for changes a bit more efficient. It also potentially allows us to do more fancy things if we want, like building up a persistent secondary index by listening to changes from the main replica.

### write()

The implementation of `Post.write()` is a little simpler. For atomic types, it just converts the value to a string or attachment and writes it to the replica. For more complex types, it recurses through the changes provided and calls through to the simpler types that it combines to write out the corresponding documents.

Updates to complex types are all assumed to be partial updates - passing in only some of the properties of an object leaves others untouched.

Types should interpret a `null` value to wipe the doc at that path and all beneath it.

## Modelling collections and relationships

So far, we've assumed that everything related to an object lives under a single root path that identifies it.

`dict()` and `set()` are a useful way of modelling relationships and collections.

A `set` is a collection of strings stored as url-encoded slugs in the path. Let's use it to represent a relationship:

```typescript
const Post = object({
  content: string,
  title: string,
  readNext: set,
});

// Write a post
await Post.write({
  author: me,
  replica: myReplica,
  path: "/posts/1",
  data: {
    title: "Hello, world",
    content: "This is an example post",
  },
});

// Write a post, linked to the first one
await Post.write({
  author: me,
  replica: myReplica,
  path: "/posts/2",
  data: {
    readNext: {
      "/posts/1": true,
    },
  },
});
```

We now have the following documents in our replica:

```
/posts/1/title -> Hello, world
/posts/1/content -> This is an example post
/posts/2/title -> Dogs are great
/posts/2/content -> This is another example post
/posts/2/readNext/%2Fposts%2F1%2F -> 1
```

We can unlink the post but leave other properties (and links) untouched by setting the link to `null`:

```typescript
await Post.write({
  replica: myReplica,
  author: me,
  path: "/posts/2",
  data: {
    readNext: {
      "/posts/1": null,
    },
  },
});
```

The `dict` type stores keys in the document path the same way that a set does, but allows us to also provide a type for
its value.

We can use this to model collections. If all our posts live under a single path (as in the examples above) then we can similarly query for a whole list of posts by treating the collection of all posts as a dictionary mapping ids to objects.

```typescript
const PostCollection = dict(Post);
const allPosts = readObjects(Post, { replica: "/posts" });

for (const [id, post] of Object.entries(allPosts)) {
  console.log(id, "->", post);
}
```

The dict type can also be useful for relationships between objects when we want to include some contextual information about the relationship that doesn't belong in the linked object. For example, we might want an ordered relationship that weights the order that related posts appear in:

```typescript
const Post = object({
  content: string,
  title: string,
  related: dict(number),
});

const post = await Post.read(replica, "/posts/1");
const linkedPostPaths = Object.keys(post.related).sort(
  (a, b) => post.related[a] - post.related[b]
);
```

If we want to find the inverse of our `readNext` relation, we can use the `findByCollectionKey` utility, which returns the path to all objects that store a given value as a set or dict key:

```typescript
const readBeforePost1 = await findByCollectionKey("/posts/1", {
  collectionPrefix: "/readNext",
  replica: myReplica,
  filter: {
    pathStartsWith: "/posts",
  },
});

console.log(readBeforePost1); // ["/posts/2"]
```
