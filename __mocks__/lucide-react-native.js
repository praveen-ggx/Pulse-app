const React = require('react');
const icon = (props) => React.createElement('LucideIcon', props);
module.exports = new Proxy({}, { get: () => icon });
