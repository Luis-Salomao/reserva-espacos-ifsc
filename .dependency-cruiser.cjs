/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "domain-is-pure",
      comment: "src/domain não pode importar nada fora de src/domain (nem pacotes externos).",
      severity: "error",
      from: { path: "^src/domain/" },
      to: { pathNot: "^src/domain/" },
    },
    {
      name: "application-no-infra",
      comment: "src/application depende de portas, nunca de infra nem de UI.",
      severity: "error",
      from: { path: "^src/application/" },
      to: { path: "^src/(infra|server|routes|components)/" },
    },
    {
      name: "import-asc-is-pure",
      comment:
        "src/import-asc só pode importar src/domain e a si mesmo (mais o parser XML fast-xml-parser; arquivos *.test.ts ficam isentos, pois usam bun:test): sem infra, server, UI, application nem módulos node:.",
      severity: "error",
      from: { path: "^src/import-asc/", pathNot: "\\.test\\.ts$" },
      to: {
        pathNot: ["^src/import-asc/", "^src/domain/", "node_modules/fast-xml-parser/"],
      },
    },
    {
      name: "ui-no-infra",
      comment: "UI só acessa infra por server functions em src/server/.",
      severity: "error",
      from: { path: "^src/(routes|components)/" },
      to: { path: "^src/infra/" },
    },
    {
      name: "src-no-cli",
      comment: "cli é adaptador de borda: pode usar src/infra, mas src nunca importa cli.",
      severity: "error",
      from: { path: "^src/" },
      to: { path: "^cli/" },
    },
    {
      name: "no-circular",
      severity: "error",
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    tsConfig: { fileName: "tsconfig.json" },
    tsPreCompilationDeps: true,
    doNotFollow: { path: "node_modules" },
    exclude: { path: "routeTree.gen.ts$" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
    },
  },
};
