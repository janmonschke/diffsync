module.exports = {
  deepCopy: function(obj){
    if (obj === null || obj === undefined) {
      return obj;
    }
    return JSON.parse(JSON.stringify(obj));
  }
};
