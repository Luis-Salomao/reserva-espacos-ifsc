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
      to: { path: "^src/(infra|routes|components)/" },
    },
    {
      name: "ui-no-infra",
      comment: "UI só acessa infra por server functions em src/server/.",
      severity: "error",
      from: { path: "^src/(routes|components)/" },
      to: { path: "^src/infra/" },
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
    doNotFollow: { path: "node_modules" },
    exclude: { path: "routeTree.gen.ts$" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
    },
  },
};
