const path = require("path");
const shared = require("../../next.config.shared.cjs");

/** @type {import('next').NextConfig} */
const config = {
  ...shared,
  outputFileTracingRoot: path.resolve(__dirname, "../../"),
  experimental: {
    ...(shared.experimental ?? {}),
    externalDir: true,
  },
};

module.exports = config;

