# diffsync [![Build Status](https://travis-ci.org/janmonschke/diffsync.svg?branch=master)](https://travis-ci.org/janmonschke/diffsync)

Real time collaborative editing for JSON objects

## Install

diffsync is available via NPM for server and client (browserify & webpack):

`npm install diffsync`

If you are neither using browserify nor webpack for your client side code, you can get the latest version here:

<https://wzrd.in/standalone/diffsync>

For specific versions of the standalone version, simply add them to the URL like this:

<https://wzrd.in/standalone/diffsync@1.0.2>

## Usage

diffsync consists of a client and a server component which both implement their side of the [Differential Synchronization Algorithm](#Algorithm). These two components communicate via a custom protocol that was built on top of socket.io. However, socket.io is no hard dependency and it can be replaced by whatever communication library you wish, as long as it implements the socket.io interface.

The following paragraphs will show you how to get started. If you want to jump right into the code of a full example, head to [diffsync-todos](https://github.com/janmonschke/diffsync-todos).

### Server

Setting up the server in a very minimal way (with express):

```
  var app = require('express')();
  var http = require('http').Server(app);
  var io = require('socket.io')(http);

  var diffsync    = require('diffsync');
  var dataAdapter = new diffSync.InMemoryDataAdapter();

  var diffSyncServer = new DiffSync.Server(dataAdapter, io);

  http.listen(4000, function(){
    console.log('ready to go');
  });

```

### DataAdapter


### Client
