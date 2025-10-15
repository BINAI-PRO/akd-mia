const path = require("path");
const shared = require("../../next.config.shared.cjs");

/** @type {import('next').NextConfig} */
const config = {
  ...shared,
  experimental: {
    ...(shared.experimental ?? {}),
    externalDir: true,
    outputFileTracingRoot: path.resolve(__dirname, "../../"),
  },
};

module.exports = config;

