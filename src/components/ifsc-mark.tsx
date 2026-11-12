import ifscSymbol from "#/assets/ifsc-symbol.svg";

export function IFSCMark({ className = "" }: { className?: string }) {
  return <img src={ifscSymbol} alt="Marca do IFSC" className={className} />;
}
