/** @type {import('webpack').LoaderDefinition} */
module.exports = function (source) {
  return `export default new Uint8Array([${new Uint8Array(source)}]);`;
};
module.exports.raw = true;
