# diffsync [![Build Status](https://travis-ci.org/janmonschke/diffsync.svg?branch=master)](https://travis-ci.org/janmonschke/diffsync)

Real time collaborative editing for JSON objects

## Install

diffsync is available via NPM for server and client (browserify & webpack):

`npm install diffsync`

If you are neither using browserify nor webpack for your client side code, you can get the latest version here:

<https://wzrd.in/standalone/diffsync>

For specific versions of the standalone version, simply add them to the URL like this:

<https://wzrd.in/standalone/diffsync@1.0.2>

## How does it work?

- WebSocket rooms, requesting the data
- custom protocol for syncing
- Abstract DataAdapter for attaching whatever data source you want
- changes are applied in-place

## Usage

diffsync consists of a client and a server component which both implement their side of the [Differential Synchronization Algorithm](#Algorithm). These two components communicate via a custom protocol that was built on top of socket.io. However, socket.io is no hard dependency and it can be replaced by whatever communication library you wish, as long as it implements the socket.io interface.

The following paragraphs will show you how to get started. If you want to jump right into the code of a full example, head to [diffsync-todos](https://github.com/janmonschke/diffsync-todos).

### Clientx

```javascript
  // if installed from standalone script or browserify / webpack
  var DiffSyncClient = diffsync.Client || require('diffsync').Client

  // socket.io standalone or browserify / webpack
  var socket = window.io || require('socket.io-client')

  // pass the connection and the id of the data you want to synchronize
  var client = new DiffSyncClient(socket(), id);

  var data;

  client.on('connected', function(){
    // the initial data has been loaded,
    // you can initialize your application
    data = client.getData();
  });

  client.on('synced', function(){
    // an update from the server has been applied
    // you can perform the updates in your application now
  });

  client.initialize();

  /* --- somewhere in your code --- */

  data.randomChange = Math.random();
  // schedule a sync cycle - this will sync your changes to the server
  client.sync();

```

The client is initialized by passing an instance of a socket.io connection (or a socket.io-compatible client) and the id of the object that should be synchronized with the server and other clients. The `initialize` method starts the synchronization.

The client object notifies the application about the sync-state via a couple of events:

- `connected`: The client is connected to the server and the initial data has been loaded.
- `synced`: A new version from the server has been applied to the local data, you can update views now
- `error`: There was an error during synchronization.

The data object that is being synced, can be acessed via the clients `getData` method. It can't be accessed before the `connected` event has been fired.

It is important that your application is altering the exact same object that is returned by `getData` because the algorithm synchronizes based on changesets of this object. Every update from the server is also applied to this very object and is notified by the `synced` event.

When your application has changed the state os this object, the `sync` method of the client needs to be called to trigger a sync with the server and other connected clients. Since the algorithm is based on sending diffs around, it is perfectly okay to call the `sync` method after every update on the data.

### Server

Setting up the server in a very minimal way (with express):

```javascript
  // setting up express and socket.io
  var app = require('express')();
  var http = require('http').Server(app);
  var io = require('socket.io')(http);

  // setting up diffsync's DataAdapter
  var diffsync    = require('diffsync');
  var dataAdapter = new diffSync.InMemoryDataAdapter();

  // setting up the diffsync server
  var diffSyncServer = new DiffSync.Server(dataAdapter, io);

  // starting the http server
  http.listen(4000, function(){
    console.log('ready to go');
  });

```

This is all that is needed for running the server part. There is no further addition necessary. Most of the logic is happening in the `DataAdapter`, which is described in the next section.

### DataAdapter

A `DataAdapter` is used by the server component internally to fetch data to initialize the synchronization and to save the data periodically. The simple interface allows to write a custom data provider for which ever data source you are using in your web app.

The interface consists of two methods:

- `getData(id callback)`:
  - is called for the initialization of the algorithm
  - `id (String / Number)` is the id of the data
  - `callback (Function[err, data])` the callback that should be called after fetching the data. Normal node.js style with the first parameter being the error and the second parameter being the data
- `storeData(id, data, callback)`:
  - is called to persist data peroidically
  - `id (String / Number)` is the id of the data
  - `data (Object)` the new version of the data that will be saved
  - `callback (Function[err])` call back with an error if saving failed

diffsync ships with a simple in-memory DataAdapter which is used in the above example. It is, however, not recommended to use it in a production app since it does not persist data.
