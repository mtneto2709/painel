/** Configuração do Jest para os testes unitários (src/**\/*.spec.ts). */
module.exports = {
  moduleFileExtensions: ["js", "json", "ts"],
  rootDir: "src",
  testRegex: ".*\\.spec\\.ts$",
  transform: { "^.+\\.(t|j)s$": "ts-jest" },
  collectCoverageFrom: ["**/*.(t|j)s"],
  coverageDirectory: "../coverage",
  testEnvironment: "node",
  moduleNameMapper: {
    "^@atendvalida/shared-types$": "<rootDir>/../../../packages/shared-types/src/index.ts",
  },
};
