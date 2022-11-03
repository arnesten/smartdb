# smartdb

CouchDB library for Node.js with advanced entity and cache support

Features:

* **Document <-> entity mappings** - configure how to map your document to entities and back again
* **Cache** - get a performance boost by using the in-memory cache, Redis cache or your custom cache
* **Validation** - validate your entities before saving
* **Multi-database support** - use different databases for different entities transparently
* **Unit test support** - intelligent fake instance to use for your tests

## Example

```javascript
import SmartDb from 'smartdb';

let db = SmartDb({
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
    ],
    // This is optional. It enables you to map from document to entity
    mapDocToEntity(doc) {
        let type = doc.type;
        if (type === 'user') return new User(doc);
        if (type === 'blogPost') return new BlogPost(doc);
        if (type === 'blogComment') return new BlogComment(doc);
        
        throw new Error('Unsupported entity type: ' + type); 
    }
});

// Saving a user
let johnDoe = new User({
    fullName: 'John Doe',
    email: 'john.doe@mail.com'
});
await db.save(johnDoe);
// johnDoe._id and johnDoe._rev is automatically set by save()

// Getting a blog post by ID
let blogPost = await db.get('blogPost', blogPostId);
// The blogPost will be an instantiated entity BlogPost
```

## API

#### db.get(type, id, callback)

Get entity by type and ID. Callback signature is `(err, entity)`. If no document found, will return an error.

#### db.getOrNull(type, id, callback)

Same as db.get() but return null instead of error when no document found.
Will also return null if `id` is null/undefined, which can be useful in some situations to keep code compact.

#### db.save(entity, callback)

Saves an unsaved entity. Callback signature is `(err)`. The properties _id and _rev will automatically be set on the
given entity after save complete.

#### db.update(entity, callback)

Updates an existing entity. Callback signature is `(err)`. Must have _id and _rev defined. Will automatically set _rev on
the given entity after update complete.

#### db.merge(type, id, changedProperties, callback)

Change specific properties on an entity.

```javascript
db.merge('user', userId, { email: 'a.new@email.com' }, function (err, info) {
    // info = { rev: '<REV>' }
});
```

#### db.remove(type, id, callback)

Removes an entity by type and ID.

#### db.view(type, viewName, args, callback)

Calls a view and returns entities based on the documents in the response.
Callback signature is `(err, entities)`.
Will by default use a design document with the same name as `type`. However, this is configurable by using the `rewriteView` option.
You do not need to pass `include_docs: true` to the args, it is automatically set.

```javascript
db.view('user', 'byDepartment', { key: '<DEPT_ID>' }, function (err, users) {
    // If you are using entity mappings, the returned users are real entities
});
```

#### db.viewRaw(type, viewName, viewArgs, callback)

Calls a view and returns the raw JSON rows from CouchDB. Callback signature is `(err, rows)`.
Useful when you want to use the key and value properties.
Will by default use a design document with the same name as `type`. However, this is configurable by using the `rewriteView` option.

#### db.list(type, listName, viewName, args, callback)

Calls a list function and returns the raw result from CouchDB. Callback signature is `(err, body)`.

## Options

These are the options you can give when creating the smartdb instance:

#### databases

An array of databases where you define where entities are located.
You can also set cache settings per entity. 
Define one array item for each database where you have entites. 
In the database `url` you set the full path to the database. That includes protocol (http or https), 
optional authentication, hostname and database name.
```javascript
{
    databases: [
        {
            url: 'http://username:password@somehost:5984/blog',
            entities: {
                blogPost: {
                    cacheMaxAge: 5 * 60 * 1000, // Cache for 5 minutes
                    cacheMaxSize: 100 // Have 100 items at most in the cache
                },
                blogComment: { } // Will not be cached
            }
        }
    ]
}
```

#### typeProperty

The property on the entity that identies the entity type. Default is `'type'`.
```javascript
{
    type: 'entityType'
}
```

#### mapDocToEntity

Maps a document to an entity. This is useful if you want to wrap the document and add methods to interact with the data.
The default is to just returns the JSON document retrieved from the database.

```javascript
{
    mapDocToEntity: function (doc) {
        var map = {
            user: User,
            blogPost: BlogPost,
            blogComment: BlogComment
        };
        var Constructor = map[doc.type];
        return new Constructor(doc);
    }
}
```

#### mapEntityToDoc

Maps an entity to the document to save to the database. The default is to just use JSON.stringify() on the entity. 
In some cases you might want to strip it of some properties or change something before saving, then define a function here.
One way might be to have a convention to have a `toDoc()` method on entities.
```javascript
{
    mapEntityToDoc: function (entity) {
        if (entity.toDoc) {
            return entity.toDoc();
        }
        return entity;
    }
}
```

#### cacheProvider

By default *smartdb* uses an in-memory cache inside the same Node.js process. 
This works well when you only have a single Node.js process that use your CouchDB database. 

If you have multiple Node.js processes the recommendation is to use the 
[Redis cache provider](https://github.com/arnesten/smartdb-rediscacheprovider) that is available for *smartdb*.

```javascript
{
    cacheProvider: require('smartdb-rediscacheprovider')({ /* cache provider options */  })
}
```

#### validate

You might want to validate your entities before sending them to CouchDB for saving. The signature of this function is
`(entity, callback)`. If you return an error in the callback *smartdb* will not send the request to CouchDB but
instead return an error.

```javascript
{
    validate(entity, callback) {
        if (entity.validate) {
            entity.validate(callback);
        }
        else {
            callback();
        }
    }
}
```

#### rewriteView

The default when using `db.view('user', 'byDepartment', ...)` is to use the view `byDepartment`
in the design document `user`. But you might want a different strategy. If you use this option, 
define a function that given `(type,viewName)` should return an array 
with the following format `[designDocumentName, viewName]`

Personally, I use a single view per design document to be able to add a view without causing re-indexing of many 
other views.

```javascript
{
    rewriteView(type, viewName) {
        return [type + '-' + viewName, 'fn'];
    }
}
```
This means that `db.view('user', 'byDepartment', ...)` would go to the 
design document `user-byDepartment` and the view named `fn`.

## Errors

For `get` and `merge` if entity does not exist, gives the following error:

```javascript
{
    name: 'EntityMissingError',
    message: 'Entity is missing',
    scope: 'smartdb',
    entityId: 'XYZ123',
    entityType: 'user'
}
```

For `save`, `merge`, `remove` and `update` if you get a conflict, gives the following error:
```javascript
{
    name: 'EntityConflictError',
    message: 'Conflict when trying to persist entity change',
    scope: 'smartdb',
    entityId: 'XYZ123',
    entityType: 'user'
    request: {
        method: 'PUT',
        headers: { ... },
        uri: 'http://...',
        body: '{ ... }'
    },
    response: {
        statusCode: 409,
        headers: { ... }
    }
}
```

## License

(The MIT License)

Copyright (c) 2013-2022 Calle Arnesten

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
