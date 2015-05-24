# diffsync [![Build Status](https://travis-ci.org/janmonschke/diffsync.svg?branch=master)](https://travis-ci.org/janmonschke/diffsync) [![slack backdge](https://diffsync-slack.herokuapp.com/badge.svg)](https://diffsync-slack.herokuapp.com/)

Enables real-time collaborative editing of arbitrary JSON objects

## Table of contents

- [Installation](#installation)
- [Demo](#demo)
- [How does it work?](#how-does-it-work)
- [Contact](#contact)
- [Usage](#usage)
  - [Client](#client)
  - [Server](#server)
  - [DataAdapter](#dataadapter)
- [Best Practices](#best-practices)
- [Algorithm](#algorithm)
- [Socket.io independence](#socketio-independence)

## Installation

diffsync is available via NPM for server and client (browserify & webpack):

`npm install diffsync`

If you are neither using browserify nor webpack for your client side code, you can get the latest version here:

<https://wzrd.in/standalone/diffsync>

For specific versions of the standalone version, simply add them to the URL like this:

<https://wzrd.in/standalone/diffsync@2.1.0>

## Demo

[DiffSync-Todos](https://diffsync-todos.herokuapp.com): An example implementation of a collaborative todo list hosted on heroku. (Source code: <https://github.com/janmonschke/diffsync-todos>) Try it out with a couple of browser windows open for the same list :)

## How does it work?

- The client fetches the initial state of the data and enters a sync-room via WebSockets
- Every change of this state is synced via the `sync` method
- Clients receive events about changes from the server which are automatically applied to a shared object (in-place)
- The server takes care of syncing the state of all connected clients
- It uses a simple DataAdapter interface to fetch and store data with any kind of database
- Client and Server are syncing with the [Differential Synchronization](#algorithm) algorithm

## Contact

For any questions about diffsync and general chat about collaborative websites, join our [Slack channel](https://diffsync-slack.herokuapp.com/) :)

## Usage

diffsync consists of a client and a server component which both implement their side of the [Differential Synchronization Algorithm](#algorithm). These two components communicate via a custom protocol that was built on top of socket.io. However, socket.io is no hard dependency and it can be replaced by whatever communication library you wish, as long as it implements the socket.io interface.

The following paragraphs will show you how to get started. If you want to jump right into the code of a full example, head to [diffsync-todos](https://github.com/janmonschke/diffsync-todos).

### Client

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

The data object that is being synced, can be accessed via the clients `getData` method. It can't be accessed before the `connected` event has been fired.

It is important that your application is altering the exact same object that is returned by `getData` because the algorithm synchronizes based on changesets of this object. Every update from the server is also applied to this very object and is notified by the `synced` event.

When your application has changed the state of this object, the `sync` method of the client needs to be called to trigger a sync with the server and other connected clients. Since the algorithm is based on sending diffs around, it is perfectly okay to call the `sync` method after every update on the data.

The [diffsync-todos app](https://github.com/janmonschke/diffsync-todos) provides an example client-side integration of diffsync into a todo list application. Check it out to find out how to integrate it into your existing application. In a nutshell, it makes use of `Object.observe` (and a polyfill for it) to track changes from within the app that are then synced to the server.

As a third optional parameter you can pass an options object to the constructor, that will then be applied to the internal diff-library. For a list of options, please check <https://github.com/benjamine/jsondiffpatch#options>.

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

As a third optional parameter you can pass an options object to the constructor, that will then be applied to the internal diff-library. For a list of options, please check <https://github.com/benjamine/jsondiffpatch#options>.

### DataAdapter

A `DataAdapter` is used by the server component internally to fetch data to initialize the synchronization and to save the data periodically. The simple interface allows to write a custom data provider for which ever data source you are using in your web app.

The interface consists of two methods:

- `getData(id callback)`:
  - is called for the initialization of the algorithm
  - `id (String / Number)` is the id of the data
  - `callback (Function[err, data])` the callback that should be called after fetching the data. Normal node.js style with the first parameter being the error and the second parameter being the data
- `storeData(id, data, callback)`:
  - is called to persist data periodically
  - `id (String / Number)` is the id of the data
  - `data (Object)` the new version of the data that will be saved
  - `callback (Function[err])` call back with an error if saving failed

diffsync ships with a simple in-memory DataAdapter which is used in the above example. It is, however, not recommended to use it in a production app since it does not persist data.

## Best Practices

- If you have arrays of objects in your data structure, it is highly recommended, that these objects have either an `id` or an `_id` field which can will be used by the diff-algorithm to identify moved objects in an array
- Error events are the result of a problem in the sync cycle and there is currently no failback procedure implemented yet (see [Algorithm](#algorithm)). The best way to restore sync is to reload the client's page. Since only very small diffs are sent around, the data loss should be minimal. This might sound pretty horrible at first, but in reality, sync problems almost never occur unless one of the sides has lost the connection for a substantial amount of time.

## Algorithm

The Differential Synchronization algorithm was invented by Neil Fraser in 2009. He wrote a paper about that can be found here: <https://neil.fraser.name/writing/sync/>. In addition to that, he held a Google Tech Talk about it, which is available on YouTube: <https://www.youtube.com/watch?v=S2Hp_1jqpY8>.

## Socket.io independence

Neither client, nor server ship with a dependency of socket.io. This allows to replace the transportation layer with a completely different library which is compatible to the socket.io interface. This implementation relies on named-events, acknowledgments, rooms and it does not make any assumption about the underlying transportation protocol.
