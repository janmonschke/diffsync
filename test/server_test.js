var assert        = require('assert'),
    sinon         = require('sinon'),
    isArray       = require('lodash.isarray'),
    isObject      = require('lodash.isobject'),
    jsondiffpatch = require('jsondiffpatch').create({
      objectHash: function(obj) { return obj.id || obj._id || JSON.stringify(obj); }
    }),
    EventEmitter  = require('events').EventEmitter,

    COMMANDS      = require('../index').COMMANDS,
    Server        = require('../index').Server,
    Adapter       = require('../index').InMemoryDataAdapter;

describe('DiffSync Server', function(){
  var testRoom = 'testRoom';
  var testTransport = function(){
    return {
      id: Math.random() + '',
      on: function(){},
      emit: function(){},
      join: function(){},
      to: function(){
        return new EventEmitter();
      }
    };
  };
  var testData = function(data){
    return {
      registeredSockets: [],
      clientVersions: {},
      serverCopy: data
    };
  };
  var testAdapter = function(){
    return new Adapter({
      testRoom: {testData: 1, testArray: [{awesome: true}]}
    });
  };
  var testServer = function(){
    return new Server(testAdapter(), testTransport());
  };

  describe('constructor', function(){
    it('should throw if no adapter or transport is passed', function(){
      assert.throws(function(){
        new Server();
      });

      assert.throws(function(){
        new Server(testAdapter());
      });

      assert.doesNotThrow(function(){
        new Server(testAdapter(), testTransport());
      });
    });

    it('should apply the correct options to jsondiffpatch', function(){
      var client = new Server(testAdapter(), testTransport(), { textDiff: { minLength: 2 }});

      assert(client.jsondiffpatch.options().textDiff.minLength === 2);
    });
  });

  describe('trackConnection', function(){
    var connection;

    beforeEach(function(){
      connection = new EventEmitter();
    });

    it('should bind the callbacks properly', function(){
      var server = testServer(),
          joinSpy = sinon.stub(server, 'joinConnection', function(){}),
          syncSpy = sinon.stub(server, 'receiveEdit', function(){}),
          testEdit = {},
          testCb = function(){};

      server.trackConnection(connection);

      connection.emit(COMMANDS.join, testRoom, testCb);

      assert(joinSpy.called);
      assert(joinSpy.calledWithExactly(connection, testRoom, testCb));
      assert(joinSpy.calledOn(server));

      connection.emit(COMMANDS.syncWithServer, testEdit, testCb);

      assert(syncSpy.called);
      assert(syncSpy.calledWithExactly(connection, testEdit, testCb));
      assert(syncSpy.calledOn(server));
    });
  });

  describe('getData', function(){
    var server;

    beforeEach(function(){
      server = testServer();
    });

    it('should return the correct data from the cache', function(){
      var data = {test: true},
          spy = sinon.spy(),
          adapterSpy = sinon.spy(server.adapter, 'getData');

      server.data[testRoom] = data;

      server.getData(testRoom, spy);

      assert(spy.called);
      assert(spy.calledWithExactly(null, data));
      assert(!adapterSpy.called, 'it should not call the adapter');
    });

    it('should go to adapter if cache is empty', function(){
      var data = {test: true},
          spy = sinon.spy(),
          adapterSpy = sinon.spy(server.adapter, 'getData');

      server.adapter.cache[testRoom] = data;
      server.getData(testRoom, spy);

      assert(spy.called, 'called the callback');
      assert(spy.args[0][1].serverCopy === data);

      assert(adapterSpy.called, 'alled the adapter');
      assert(adapterSpy.calledWith(testRoom));
    });

    it('should not ask the adapter for the same data twice', function(){
      var data = {test: true},
          spy = sinon.spy(),
          adapterSpy = sinon.stub(server.adapter, 'getData', function(){});

      server.getData(testRoom, spy);
      server.getData(testRoom, spy);

      assert(adapterSpy.calledOnce);
    });

    it('should create the correct format for data internally', function(){
      var data = {test: true},
          spy = sinon.spy();

      server.adapter.cache[testRoom] = data;
      server.getData(testRoom, spy);

      assert(spy.called, 'called the callback');
      assert(isArray(server.data[testRoom].registeredSockets), 'correct data in `serverCopy`');
      assert(isObject(server.data[testRoom].clientVersions), 'correct data in `clientVersions`');
      assert(isObject(server.data[testRoom].serverCopy), 'correct data in `serverCopy`');
      assert(server.data[testRoom].serverCopy === data, 'correct value of data in `serverCopy`');
    });
  });

  describe('joinConnection', function(){
    var server, connection;

    beforeEach(function(){
      server = testServer();
      connection = testTransport();
    });

    it('calls the internal `getData` to fetch the data for a room', function(){
      var getDataSpy = sinon.stub(server, 'getData');

      server.joinConnection({}, testRoom, function(){});

      assert(getDataSpy.called);
    });

    it('returns the correct data to the client', function(done){
      var data = testData({awesome: true});

      sinon.stub(server, 'getData', function(room, cb){ cb(null, data); });

      server.joinConnection(connection, testRoom, function(_data){
        assert.deepEqual(data.serverCopy, _data);
        done();
      });
    });

    it('connects the client to the right room', function(done){
      var joinSpy = sinon.spy(connection, 'join');

      server.joinConnection(connection, testRoom, function(){
        assert(joinSpy.called);
        assert(joinSpy.calledWithExactly(testRoom));
        done();
      });
    });

    it('adds the client to the internal tracking document and properly copies objects', function(done){
      var trackingDoc, clientVersion;

      server.joinConnection(connection, testRoom, function(_data){
        trackingDoc = server.data[testRoom];
        clientVersion = trackingDoc.clientVersions[connection.id];
        assert.deepEqual(trackingDoc.serverCopy, _data, 'the data that is being transferred to the client is equal to the server version');
        assert.deepEqual(clientVersion.shadow.doc, _data, 'shadow doc is equal to transferred doc');
        assert.deepEqual(clientVersion.backup.doc, _data, 'backup doc is equal to transferred doc');
        assert.notStrictEqual(clientVersion.backup.doc, _data, 'backup doc and transferred doc are not the same reference');
        assert.notStrictEqual(clientVersion.shadow.doc, _data, 'shadow doc and transferred doc are not the same reference');
        assert.notStrictEqual(clientVersion.backup.doc, clientVersion.shadow.doc, 'backup doc and shadow doc are not the same reference');
        done();
      });
    });
  });

  describe('receiveEdit', function(){
    var server, connection, editMessage;

    beforeEach(function(){
      server = testServer();
      connection = testTransport();
      editMessage = {
        room: testRoom,
        serverVersion: 0,
        clientVersion: 0,
        edits: [{
          serverVersion: 0,
          localVersion: 0,
          diff: JSON.parse(JSON.stringify(jsondiffpatch.diff(server.adapter.cache[testRoom], {
            testArray: [{awesome: false}, {newone: true}]
          })))
        }]
      };
    });

    var join = function(){
      server.joinConnection(connection, testRoom, function(){});
    };

    it('gets data from the correct coom', function(){
      var getDataSpy = sinon.stub(server, 'getData', function(){});

      server.receiveEdit(connection, editMessage, function(){});

      assert(getDataSpy.called);
      assert(getDataSpy.calledWith(testRoom));
    });

    it('emits an error if it does not find a document for this client', function(){
      var emitSpy = sinon.spy(connection, 'emit');

      server.receiveEdit(connection, editMessage, function(){});

      assert(emitSpy.called);
      assert(emitSpy.calledWith(COMMANDS.error));
    });

    it('should perform a half server-side sync cycle', function(){
      var saveSnapshotSpy = sinon.spy(server, 'saveSnapshot'),
          sendServerChangesSpy = sinon.stub(server, 'sendServerChanges', function(){}),
          emitter = new EventEmitter(),
          emitterSpy = sinon.spy(emitter, 'emit'),
          toRoomSpy = sinon.stub(server.transport, 'to', function(){ return emitter; }),
          initialLocalVersion = 0,
          clientDoc, serverDoc;

      join();
      server.receiveEdit(connection, editMessage, function(){});

      serverDoc = server.data[testRoom];
      clientDoc = serverDoc.clientVersions[connection.id];

      // the shadow and the backup have to be different after that change
      assert.notDeepEqual(clientDoc.shadow.doc, clientDoc.backup.doc);
      assert.notDeepEqual(clientDoc.shadow.doc.testArray[0], clientDoc.backup.doc.testArray[0]);

      // the server testArray[0] and the shadow version should be the same by value and not by reference
      assert.deepEqual(clientDoc.shadow.doc.testArray[0], serverDoc.serverCopy.testArray[0]);
      assert.notStrictEqual(clientDoc.shadow.doc.testArray[0], serverDoc.serverCopy.testArray[0]);

      // the local version should be incremented by the diff
      assert(clientDoc.shadow.localVersion === initialLocalVersion + 1);

      assert(saveSnapshotSpy.called);
      assert(sendServerChangesSpy.called);

      assert(toRoomSpy.called);
      assert(toRoomSpy.calledWithExactly(testRoom));
      assert(emitterSpy.called);
      assert(emitterSpy.calledWithExactly(COMMANDS.remoteUpdateIncoming, connection.id));
    });

    it('should not send sync notifications if empty update', function(){
      var emitter = new EventEmitter(),
          emitterSpy = sinon.spy(emitter, 'emit');

      // empty message
      editMessage.edits = [];

      join();
      server.receiveEdit(connection, editMessage, function(){});

      assert(!emitterSpy.called);
    });

  });

  describe('saveSnapshot', function(){
    it('calls the storeData method of the adatpter', function(){
      var server = testServer(),
          storeDataSpy = sinon.spy(server.adapter, 'storeData');

      server.saveSnapshot(testRoom);

      assert(storeDataSpy.called);
      assert(storeDataSpy.calledWith(testRoom, server.adapter.cache[testRoom]));
    });

    it('should save snaphots in correct order and wait for previous requests to finish', function(){
      var server = testServer(),
          storeDataSpy = sinon.stub(server.adapter, 'storeData', function(){});

      server.saveSnapshot(testRoom);
      server.saveSnapshot(testRoom);
      server.saveSnapshot(testRoom);
      server.saveSnapshot(testRoom);

      assert(storeDataSpy.calledOnce);
    });
  });

  describe('sendServerChanges', function(){
    var send = function(){},
        clientDoc, doc, server;

    beforeEach(function(){
      server = testServer();

      clientDoc = {
        edits: [],
        shadow: {
          serverVersion: 0,
          localVersion: 0,
          doc: {awesome: false}
        }
      };

      doc = {
        serverCopy: { awesome: true, testArray: [{}] }
      };
    });

    it('should update the shadow serverVersion if diff not empty', function(){
      server.sendServerChanges(doc, clientDoc, send);
      assert(clientDoc.shadow.serverVersion === 1, 'server version increased');

      clientDoc.shadow.doc = {};
      doc.serverCopy = {};
      server.sendServerChanges(doc, clientDoc, send);
      assert(clientDoc.shadow.serverVersion === 1, 'server version is the same');
    });

    it('should send a diff and update the server´s shadow correctly', function(){
      var sendSpy = sinon.spy();

      server.sendServerChanges(doc, clientDoc, sendSpy);

      assert(sendSpy.called);
      assert.deepEqual(doc.serverCopy, clientDoc.shadow.doc);
      assert.notStrictEqual(doc.serverCopy, clientDoc.shadow.doc);
      assert.notStrictEqual(doc.serverCopy.testArray, clientDoc.shadow.doc.testArray);
      assert.notStrictEqual(doc.serverCopy.testArray[0], clientDoc.shadow.doc.testArray[0]);
    });
  });
});
