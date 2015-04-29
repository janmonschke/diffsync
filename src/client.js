var assign        = require('lodash.assign'),
    bind          = require('lodash.bind'),
    isEmpty       = require('lodash.isempty'),
    EventEmitter  = require('events').EventEmitter,
    jsondiffpatch = require('jsondiffpatch'),

    COMMANDS  = require('./commands'),
    utils     = require('./utils'),
    Client;

Client = function(socket, room, diffOptions){
  if(!socket){ throw new Error('No socket specified'); }
  if(!room){ room = ''; }
  if(!diffOptions){ diffOptions = {}; }

  this.socket = socket;
  this.room = room;
  this.syncing = false;
  this.initialized = false;
  this.scheduled = false;
  this.doc = {
    localVersion: 0,
    serverVersion: 0,
    shadow: {},
    localCopy: {},
    edits: []
  };

  // set up the jsondiffpatch options
  // see here for options: https://github.com/benjamine/jsondiffpatch#options
  diffOptions = assign({
    objectHash: function(obj) { return obj.id || obj._id || JSON.stringify(obj); }
  }, diffOptions);

  this.jsondiffpatch = jsondiffpatch.create(diffOptions);

  // let client be an EventEmitter
  EventEmitter.call(this);

  // bind functions
  var methodsToBind = ['_onConnected', 'syncWithServer', 'applyServerEdit', 'applyServerEdits', 'schedule', 'onRemoteUpdate'],
      method;

  for(var index in methodsToBind){
    method = methodsToBind[index];
    this[method] = bind(this[method], this);
  }
};

// inherit from EventEmitter
Client.prototype = new EventEmitter();

/**
 * Get the data
 * @return {Object} [description]
 */
Client.prototype.getData = function(){
  return this.doc.localCopy;
};

/**
 * Initializes the sync session
 */
Client.prototype.initialize = function(){
  // connect, join room and initialize
  this.syncing = true;
  this.socket.emit(COMMANDS.join, this.room, this._onConnected);
};

/**
 * Sets up the local version and listens to server updates
 * Will notify the `onConnected` callback.
 * @param  {Object} initialVersion The initial version from the server
 */
Client.prototype._onConnected = function(initialVersion){
  // client is not syncing anymore and is initialized
  this.syncing = false;
  this.initialized = true;

  // set up shadow doc, local doc and initial server version
  // IMPORTANT: the shadow needs to be a deep copy of the initial version
  // because otherwise changes to the local object will also result in changes
  // to the shadow object because they are pointing to the same doc
  this.doc.shadow = utils.deepCopy(initialVersion);
  this.doc.localCopy = initialVersion;
  this.doc.serverVersion = 0;

  // listen to incoming updates from the server
  this.socket.on(COMMANDS.remoteUpdateIncoming, this.onRemoteUpdate);

  // notify about established connection
  this.emit('connected');
};

/**
 * Handler for remote updates
 * @param  {String} fromId id from the socket that initiated the update
 */
Client.prototype.onRemoteUpdate = function(fromId){
  // only schedule if the update was not initiated by this client
  if(this.socket.id !== fromId){
    this.schedule();
  }
};

/**
 * Schedule a sync cycle. This method should be used from the outside to
 * trigger syncs.
 */
Client.prototype.schedule = function(){
  // do nothing if already scheduled
  if(this.scheduled){ return; }
  this.scheduled = true;

  // try to sync now
  this.syncWithServer();
};

/**
 * Alias function for `sync`
 */
Client.prototype.sync = function(){
  this.schedule();
};

/**
 * Starts a sync cycle. Should not be called from third parties
 */
Client.prototype.syncWithServer = function(){
  if(this.syncing || !this.initialized){ return false; }
  if(this.scheduled){ this.scheduled = false; }

  // initiate syncing cycle
  this.syncing = true;

  // 1) create a diff of local copy and shadow
  var diff = this.createDiff(this.doc.shadow, this.doc.localCopy);
  var basedOnLocalVersion = this.doc.localVersion;

  // 2) add the difference to the local edits stack if the diff is not empty
  if(!isEmpty(diff)){
    this.doc.edits.push(this.createDiffMessage(diff, basedOnLocalVersion));
    this.doc.localVersion++;
  }

  // 3) create an edit message with all relevant version numbers
  var editMessage = this.createEditMessage(basedOnLocalVersion);

  // 4) apply the patch to the local shadow
  this.applyPatchTo(this.doc.shadow, utils.deepCopy(diff));

  // 5) send the edits to the server
  this.sendEdits(editMessage);

  // yes, we're syncing
  return true;
};

/**
 * Returns a diff of the passed documents
 * @param  {Object} docA
 * @param  {Object} docB
 * @return {Diff}      The diff of both documents
 */
Client.prototype.createDiff = function(docA, docB){
  return this.jsondiffpatch.diff(docA, docB);
};

/**
 * Applies the path to the specified object
 * WARNING: The patch is applied in place!
 * @param  {Object} obj
 * @param  {Diff} patch
 */
Client.prototype.applyPatchTo = function(obj, patch){
  this.jsondiffpatch.patch(obj, patch);
};

/**
 * Creates a message for the specified diff
 * @param  {Diff} diff          the diff that will be sent
 * @param  {Number} baseVersion the version of which the diff is based
 * @return {Object}             a diff message
 */
Client.prototype.createDiffMessage = function(diff, baseVersion){
  return {
    serverVersion: this.doc.serverVersion,
    localVersion: baseVersion,
    diff: diff
  };
};

/**
 * Creates a message representing a set of edits
 * An edit message contains all edits since the last sync has happened.
 * @param  {Number} baseVersion The version that these edits are based on
 * @return {Object}             An edit message
 */
Client.prototype.createEditMessage = function(baseVersion){
  return {
    room: this.room,
    edits: this.doc.edits,
    localVersion: baseVersion,
    serverVersion: this.doc.serverVersion
  };
};

/**
 * Send the the edits to the server and applies potential updates from the server
 */
Client.prototype.sendEdits = function(editMessage){
  this.socket.emit(COMMANDS.syncWithServer, editMessage, this.applyServerEdits);
};

/**
 * Applies all edits from the server and notfies about changes
 * @param  {Object} serverEdits The edits message
 */
Client.prototype.applyServerEdits = function(serverEdits){
  if(serverEdits && serverEdits.localVersion === this.doc.localVersion){
    // 0) delete all previous edits
    this.doc.edits = [];
    // 1) iterate over all edits
    serverEdits.edits.forEach(this.applyServerEdit);
  }else{
    // Rejected patch because localVersions don't match
    this.emit('error', 'REJECTED_PATCH');
  }

  // we are not syncing any more
  this.syncing = false;

  // notify about sync
  this.emit('synced');

  // if a sync has been scheduled, sync again
  if(this.scheduled) {
    this.syncWithServer();
  }
};

/**
 * Applies a single edit message to the local copy and the shadow
 * @param  {[type]} editMessage [description]
 * @return {[type]}             [description]
 */
Client.prototype.applyServerEdit =  function(editMessage){
  // 2) check the version numbers
  if(editMessage.localVersion === this.doc.localVersion &&
    editMessage.serverVersion === this.doc.serverVersion){

    if(!isEmpty(editMessage.diff)){
      // versions match
      // 3) patch the shadow
      this.applyPatchTo(this.doc.shadow, editMessage.diff);

      // 4) increase the version number for the shadow if diff not empty
      this.doc.serverVersion++;
      // apply the patch to the local document
      // IMPORTANT: Use a copy of the diff, or newly created objects will be copied by reference!
      this.applyPatchTo(this.doc.localCopy, utils.deepCopy(editMessage.diff));
    }

    return true;
  }else{
    // TODO: check in the algo paper what should happen in the case of not matching version numbers
    return false;
  }
};

module.exports = Client;
