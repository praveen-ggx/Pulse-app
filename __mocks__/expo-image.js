const React = require("react");
const { Image } = require("react-native");

function ExpoImage(props) {
  return React.createElement(Image, props);
}

ExpoImage.prefetch = jest.fn(() => Promise.resolve(true));

module.exports = {
  Image: ExpoImage,
};
