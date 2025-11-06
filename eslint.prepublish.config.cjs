const base = require('./eslint.config.js');

module.exports = [
  base[0],
  {
    ...base[1],
    rules: {
      ...base[1].rules,
      'n8n-nodes-base/community-package-json-name-still-default': 'error',
    },
  },
  base[2],
  base[3],
];
