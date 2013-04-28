# smartdb

CouchDB library for Node.js with advanced entity and cache support

Features:
* **Document <-> entity mappings** - configure how to map your document to entities and back again
* **Cache** - get a performance boost by using the in-memory cache, Redis cache or your custom cache
* **Validation** - validate your entities before saving
* **Event hooks** - make changes to your document directly before saving a document
* **Multi-database support** - use different databases for different entities transparently
* **Unit test support** - intelligent fake instance to use for your tests

## Example

```javascript
var smartdb = require('smartdb');

var db = smartdb({
    databases: [
        {
            url: 'http://localhost:5984/userdb',
            entities: {
                user: { }
            }
        },
        {
            url: 'http://localhost:5984/blogdb',
            entities: {
                blogPost: { },
                blogComment: { }
            }
        }
    ]
});

// Saving a user
var johnDoe = {
    fullName: 'John Doe',
    email: 'john.doe@mail.com',
    type: 'user' // By convention, this field is used to identify database and entity
};
db.save(johnDoe, function (err) {
    if (err) return handleErr(err);

    // johnDoe._id and johnDoe._rev is automatically set by save()
});

// Getting a blog post by ID
db.get('blogPost', blogPostId, function (err, blogPost) {
    if (err) return handleErr(err);

    // By using entity mappings you could have the blogPost
    // document mapped to a blogPost entity with methods
});

```

## API

### db.get(type, id, callback)

Get entity by type and ID. Callback signature is `(err, entity)`. If no document found, will return an error.

### db.getOrNull(type, id, callback)

Same as db.get() but return null instead of error when no document found.
Will also return null if `id` is null/undefined, which can be useful in some situations to keep code compact.

### db.save(entity, callback)

Saves an unsaved entity. Callback signature is `(err)`. The properties _id and _rev will automatically be set on the
given entity after save complete.

### db.update(entity, callback)

Updates an existing entity. Callback signature is `(err). Must have _id and _rev defined. Will automatically set _rev on
the given entity after update complete.

### db.merge(type, id, changedProperties, callback)

Change specific properties on an entity. Example:

```javascript
db.merge('user', userId, { email: 'a.new@email.com' }, function (err, info) {
    // info = { rev: '<REV>' }
});
```

### db.remove(type, id, callback)

Removes a entity by type and ID.

### db.view(type, viewName, args, callback)

Calls a view and returns entities based on the documents in the response.
Callback signature is `(err, entities)`.
Will by default use a design document with the same name as `type`. However, this is configurable by using the `rewriteView` option.
You do not need to pass `include_docs: true` to the args, it is automatically set.

Example:
```javascript
db.view('user', 'byDepartment', { key: '<DEPT_ID>' }, function (err, users) {
    // If you are using entity mappings, the returned users are real entities
});
```

### db.viewRaw(type, viewName, viewArgs, callback)

Calls a view and returns the raw JSON rows from CouchDB. Callback signature is `(err, rows)`.
Useful when you want to use the key and value properties.
Will by default use a design document with the same name as `type`. However, this is configurable by using the `rewriteView` option.

### db.list(type, listName, viewName, args, callback)

Calls a list function and returns the raw result from CouchDB. Callback signature is `(err, body)`.


## Options

These are the options you can give when creating the smartdb instance:





## License

(The MIT License)

Copyright (c) 2013 Calle Arnesten

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
