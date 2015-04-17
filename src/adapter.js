/**
 * A dumb in-memory data store. Do not use in production.
 * Only for demo purposes.
 * @param {Object} cache
 */
var InMemoryDataAdapter = function(cache){
  // `stores` all data
  this.cache = cache || {};
};

/**
 * Get the data specified by the id
 * @param  {String/Number}   id ID for the requested data
 * @param  {Function} cb
 */
InMemoryDataAdapter.prototype.getData = function(id, cb){
  var data = this.cache[id];
  if(!data){
    this.cache[id] = {};
  }
  cb(null, this.cache[id]);
};

/**
 * Stores `data` at `id`
 */
InMemoryDataAdapter.prototype.storeData = function(id, data, cb){
  this.cache[id] = data;
  if(cb){ cb(null); }
};

module.exports = InMemoryDataAdapter;
