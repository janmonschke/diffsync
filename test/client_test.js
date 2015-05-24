var assert        = require('assert'),
    sinon         = require('sinon'),
    isEmpty       = require('lodash.isempty'),
    jsondiffpatch = require('jsondiffpatch').create({
      objectHash: function(obj) { return obj.id || obj._id || JSON.stringify(obj); }
    }),

    COMMANDS      = require('../index').COMMANDS,
    Client        = require('../index').Client;

describe('DiffSync Client', function(){

  var testClient = function(){
    return new Client({
      emit: function(){},
      on: function(){},
      id: '1'
    }, 'testroom');
  };

  var testData = function(){
    return {a: 1, b: [{c: 1}]};
  };

  describe('constructor', function(){
    it('should throw if no socket passed', function(){
      assert.throws(function(){
        new Client();
      }, Error);

      assert.doesNotThrow(function() {
        testClient();
      });
    });

    it('should set a default room', function(){
      assert.notStrictEqual(testClient().room, null);
      assert.notStrictEqual(testClient().room, undefined);
    });

    it('should apply the correct options to jsondiffpatch', function(){
      var client = new Client({}, 1, { textDiff: { minLength: 2 }});

      assert(client.jsondiffpatch.options().textDiff.minLength === 2);
    });
  });

  describe('initialize', function(){
    it('should connect to the correct room', function(){
      var c   = testClient(),
          spy = sinon.spy(c.socket, 'emit');

      c.initialize();

      assert(spy.called);
      assert(spy.calledWith(COMMANDS.join, c.room));
    });
  });

  describe('onRemoteUpdate', function(){
    var client;
    beforeEach(function(){
      client = testClient();
    });

    it('should not schedule if update comes from the same client', function(){
      var scheduleSpy = sinon.stub(client, 'schedule', function(){});

      // 1 is the id of the local client
      client.onRemoteUpdate('1');

      assert(!scheduleSpy.called);
    });

    it('should schedule if update comes from another client', function(){
      var scheduleSpy = sinon.stub(client, 'schedule', function(){});

      client.onRemoteUpdate('2');

      assert(scheduleSpy.called);
    });
  });

  describe('getData', function(){
    it('should return the correct object', function(){
      var client = testClient();

      assert.deepEqual(client.doc.localCopy, client.getData());
      assert.strictEqual(client.doc.localCopy, client.getData());
    });
  });

  describe('_onConnected', function(){
    var client;
    beforeEach(function(){
      client = testClient();
    });

    it('should set the model in initialized state', function(){
      assert(!client.initialized);
      client._onConnected({});
      assert(client.initialized);
    });

    it('should release the sync cycle', function(){
      client.initialize();
      assert(client.syncing);
      client._onConnected({});
      assert(!client.syncing);
    });

    it('should subscribe to server sync requests', function(){
      var spy = sinon.spy(client.socket, 'on');

      client._onConnected({});
      assert(spy.calledWith(COMMANDS.remoteUpdateIncoming, client.onRemoteUpdate));
    });

    it('should set the shadow and the local copy correctly', function(){
      client._onConnected({ test: true, arr: [{a: 1}] });
      assert.deepEqual(client.doc.localCopy, client.doc.shadow, 'both versions should be identical by value');
      assert.notStrictEqual(client.doc.localCopy, client.doc.shadow, 'they shouldnt be the same reference');
    });

    it('should emit the `connected` event', function(){
      var emitSpy     = sinon.spy(client, 'emit'),
          listenerSpy = sinon.spy();

      client.on('connected', listenerSpy);
      client._onConnected({});

      assert(emitSpy.calledOnce);
      assert(listenerSpy.calledOnce);
    });
  });

  describe('schedule', function(){
    var client;
    beforeEach(function(){
      client = testClient();
    });

    it('should schedule a sync', function(){
      assert(!client.scheduled);
      client.schedule();
      assert(client.scheduled);
    });

    it('should try to sync', function(){
      var spy = sinon.spy(client, 'syncWithServer');
      client.schedule();
      assert(spy.calledOnce);
    });
  });

  describe('createDiff', function(){
    it('should create an empty diff for equal objects', function(){
      var a = {test: true};
      var b = {test: true};
      var diff = testClient().createDiff(a, b);

      assert(isEmpty(diff));
    });

    it('should create an not empty diff for equal objects', function(){
      var a = {test: true, test2: true};
      var b = {test: true};
      var diff = testClient().createDiff(a, b);

      assert(!isEmpty(diff));
    });
  });

  describe('createDiffMessage', function(){
    it('should create a valid diff object', function(){
      var client        = testClient(),
          serverVersion = client.doc.serverVersion,
          diff          = {},
          baseVersion   = 1,
          diffMessage   = client.createDiffMessage(diff, baseVersion);

      assert.strictEqual(diffMessage.serverVersion, serverVersion);
      assert.strictEqual(diffMessage.localVersion, baseVersion);
      assert.strictEqual(diffMessage.diff, diff);
    });
  });


  describe('createEditMessage', function(){
    it('should create a valid edit message', function(){
      var client        = testClient(),
          baseVersion   = 1,
          editMessage   = client.createEditMessage(baseVersion);

      assert.equal(editMessage.room, client.room);
      assert.equal(editMessage.localVersion, baseVersion);
      assert.equal(editMessage.serverVersion, client.doc.serverVersion);
      assert.equal(editMessage.edits, client.doc.edits);
    });
  });

  describe('syncWithServer', function(){
    var client, data, changeLocalDoc;
    beforeEach(function(){
      data = testData();
      client = testClient();
      client._onConnected(data);
    });

    changeLocalDoc = function(){
      client.doc.localCopy.b[0].c = 2;
    };

    it('should not sync if not initalized', function(){
      client.initialized = false;
      assert.equal(false, client.syncWithServer());
    });

    it('should not sync if currently syncing', function(){
      client.syncing = true;
      assert.equal(false, client.syncWithServer());
    });

    it('should reset the scheduled flag', function(){
      client.scheduled = true;
      changeLocalDoc();
      client.syncWithServer();
      assert.equal(false, client.scheduled);
    });

    it('should set syncing flag', function(){
      assert(!client.syncing);
      changeLocalDoc();
      client.syncWithServer();
      assert(client.syncing);
    });

    it('should perform a valid client-sync circle init', function(){
      var createDiff = sinon.spy(client, 'createDiff'),
          createDiffMessage = sinon.spy(client, 'createDiffMessage'),
          createEditMessage = sinon.spy(client, 'createEditMessage'),
          applyPatchTo = sinon.spy(client, 'applyPatchTo'),
          sendEdits = sinon.spy(client, 'sendEdits'),
          localVersionBeforeChange = client.doc.localVersion;

      // assert correct version
      assert.equal(client.doc.localVersion, 0, 'initial version number is 0');

      // change local version
      client.doc.localCopy.b[0].c = 2;
      client.syncWithServer();

      // creates a diff from shadow and local copy
      assert(createDiff.called, 'calls createDiff');
      assert(createDiff.calledWithExactly(client.doc.shadow, client.doc.localCopy), 'createDiff called with correct objects');

      // creates a diff message from that diff
      assert(createDiffMessage.calledAfter(createDiff), 'calls createDiffMessage after createDiff');

      // creates and edit message from that diff with correct local version
      assert(createEditMessage.calledAfter(createDiffMessage), 'calls createEditMessage after createDiffMessage');
      assert(createEditMessage.calledWithExactly(localVersionBeforeChange), 'createEditMessage is called with correct local version from before the change');

      // applies patch to shadow
      assert(applyPatchTo.calledAfter(createEditMessage), 'calls applyPatchTo after createEditMessage');
      assert.deepEqual(client.doc.shadow, client.doc.localCopy, 'applyPatchTo creates deep equality');

      assert.notStrictEqual(client.doc.shadow, client.doc.localCopy, 'shadow and local copy are equal, but not same references');
      assert.notStrictEqual(client.doc.shadow.b, client.doc.localCopy.b, 'shadow and local copy are equal, but not same references');
      assert.notStrictEqual(client.doc.shadow.b[0], client.doc.localCopy.b[0], 'shadow and local copy are equal, but not same references');

      // send the edits to the server
      assert(sendEdits.calledAfter(applyPatchTo), 'calls sendEdits after applyPatchTo');

      // assert correctly updated local version number
      assert.equal(client.doc.localVersion, 1, 'updated version number is 1');
    });
  });

  describe('applyServerEdits', function(){
    var client;
    beforeEach(function(){
      client = testClient();
      client.on('error', function(){});
    });

    it('resets the syncing flag', function(){
      client.syncing = true;
      client.applyServerEdits();

      assert(!client.syncing);
    });

    it('inits a new sync cycle only if scheduled flag is set', function(){
      var spy = sinon.spy(client, 'syncWithServer');

      client.applyServerEdits();

      assert(!spy.called);

      client.scheduled = true;
      client.applyServerEdits();

      assert(spy.called);
    });

    it('calls error callback if `local` version numbers do not match', function(){
      var emitSpy     = sinon.spy(client, 'emit'),
          listenerSpy = sinon.spy();

      client.on('error', listenerSpy);
      client.doc.localVersion = 1;
      client.applyServerEdits({localVersion: 0});

      assert(emitSpy.called);
      assert(listenerSpy.called);
    });

    it('calls `applyServerEdit` for each edit', function(){
      var spy = sinon.spy(client, 'applyServerEdit');

      client.applyServerEdits({localVersion: 0, edits: [{a: 1}, {b: 1}]});

      assert(spy.calledTwice);
    });

    it('resets the local edits list', function(){
      // too lazy to add real diffs here
      client.applyServerEdit = function(){};

      client.doc.edits = [{}];
      client.applyServerEdits({localVersion: 0, edits: [{a: 1}, {b: 1}]});

      assert(client.doc.edits.length === 0);
    });

    it('emits `synced` event after applying all updates', function(){
      var emitSpy     = sinon.spy(client, 'emit'),
          listenerSpy = sinon.spy();

      client.on('synced', listenerSpy);
      client.applyServerEdits({localVersion: 0, edits: [{a: 1}, {b: 1}]});

      assert(emitSpy.calledWithExactly('synced'));
      assert(listenerSpy.called);
    });
  });

  describe('applyServerEdit', function(){
    var client, edit, diff, serverData, emptyDiff;

    beforeEach(function(){
      client = testClient();
      client._onConnected(testData());
      serverData = testData();
      serverData.b[0].c = 2;
      serverData.b.push({newObject: true});

      diff = JSON.parse(JSON.stringify(jsondiffpatch.diff(client.doc.localCopy, serverData)));
      edit = {
        localVersion: client.doc.localVersion,
        serverVersion: client.doc.serverVersion,
        diff: diff
      };

      emptyDiff = jsondiffpatch.diff({}, {});
    });

    it('should apply the server changes and copy all values', function(){
      assert.notEqual(client.doc.localCopy.b[0].c, serverData.b[0].c, 'local version and remote version differ');

      var success = client.applyServerEdit(edit);

      assert(success, 'a valid edit has been applied');
      assert.equal(client.doc.localCopy.b[0].c, serverData.b[0].c, 'local version and remote version are equal');
      assert.deepEqual(client.doc.localCopy, client.doc.shadow, 'local version and shadow version are deep equal');
      assert.notStrictEqual(client.doc.localCopy.b[0], client.doc.shadow.b[0], 'local version and shadow version are not the same references');
      assert.deepEqual(client.doc.localCopy.b[1], client.doc.shadow.b[1], 'local version and shadow version are not the same references');
      assert.notStrictEqual(client.doc.localCopy.b[1], client.doc.shadow.b[1], 'local version and shadow version are not the same references');
    });

    it('should reject edits with wrong version numbers', function(){
      assert.notEqual(client.doc.localCopy.b[0].c, serverData.b[0].c, 'local version and remote version differ');

      edit.localVersion = client.doc.localVersion + 1;
      var success = client.applyServerEdit(edit);

      assert.notEqual(client.doc.localCopy.b[0].c, serverData.b[0].c, 'local version and remote version still differ');
      assert(!success, 'the edit is invalid');
    });

    it('updates the server version if diff was not empty', function(){
      var serverVersion = client.doc.serverVersion;

      client.applyServerEdit(edit);

      assert(client.doc.serverVersion === (serverVersion + 1));
    });

    it('does not update the server version if diff was empty', function(){
      var serverVersion = client.doc.serverVersion;

      edit.diff = emptyDiff;
      client.applyServerEdit(edit);

      assert(client.doc.serverVersion === serverVersion);
    });
  });

});
