import 'source-map-support/register'

module.exports = {
  /**
   * Make a deep copy of an object.
   * @param  {Object} object Object to make a deep copy of
   */
  deepCopy: function(obj){
    if (obj === null || obj === undefined) {
      return obj;
    }
    return JSON.parse(JSON.stringify(obj));
  },

  /**
   * Emit with deep copy on event argument objects
   * @param  {String} event  The event name
   * @param  {Object} object Event argument object
   */
  deepEmit: function(instance, event, object){
    for (var key in object) {
      if (typeof object[key] == "object" && key != "connection") {
        object[key] = this.deepCopy(object[key]);
      }
    }
    
    instance.emit(event, object);
  }
};
