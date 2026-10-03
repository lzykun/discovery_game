module.exports = {
  plugins: [
    {
      name: 'preset-default',
      params: {
        overrides: {
          removeViewBox: false, // Ensure viewBox is retained
        },
      },
    },
    {
      name: 'addAttributesToSVGElement',
      params: {
        attributes: [
          { width: '30' },
          { height: '30' },
        ],
      },
    },
  ],
};
