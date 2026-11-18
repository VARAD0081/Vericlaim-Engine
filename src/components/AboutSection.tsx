const TEAM_MATRIX = [
  {
    name: "Varad",
    affiliation: "Undergraduate Student · Woxsen University",
    focus: "Engine Architecture, Category A/B Lexical Parsing & Regulatory Synthesis",
  },
  {
    name: "Yatharth Singh",
    affiliation: "Undergraduate Student · Woxsen University",
    focus: "SEBI BRSR Principle 6 Mapping & Statutory Disclosure Frameworks",
  },
  {
    name: "Nidhish",
    affiliation: "Undergraduate Student · Woxsen University",
    focus: "EU Green Claims Directive, US FTC Green Guides & Compliance Logic",
  },
  {
    name: "Ayush Kumar",
    affiliation: "Undergraduate Student · Woxsen University",
    focus: "Public Watchdog APIs, ASCI Rulings & Evidence Strength Scoring",
  },
];

export function AboutSection() {
  return (
    <section
      id="about"
      className="border border-neutral-200 dark:border-neutral-800 rounded-md p-6 space-y-5"
    >
      <div className="space-y-1.5">
        <div className="text-xs font-mono text-neutral-500 dark:text-neutral-400">
          Woxsen University · Undergraduate Research Initiative
        </div>
        <h2 className="text-xl font-semibold tracking-tight text-neutral-950 dark:text-neutral-100">
          About The VeriClaim Engine
        </h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed max-w-3xl">
          The VeriClaim Engine is an educational decision-support workbench developed by undergraduate students at Woxsen University. It cross-verifies corporate sustainability marketing claims against unregulated global greenwashing buzzwords, statutory disclosure standards, and public accountability records.
        </p>
      </div>

      <div className="overflow-x-auto border border-neutral-200 dark:border-neutral-800 rounded">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/60 text-neutral-600 dark:text-neutral-400">
              <th className="py-2.5 px-4 font-medium">Team Member</th>
              <th className="py-2.5 px-4 font-medium">Academic Standing</th>
              <th className="py-2.5 px-4 font-medium">Matrix Responsibility</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {TEAM_MATRIX.map((member) => (
              <tr key={member.name}>
                <td className="py-3 px-4 font-semibold text-neutral-950 dark:text-neutral-100 whitespace-nowrap">
                  {member.name}
                </td>
                <td className="py-3 px-4 text-neutral-600 dark:text-neutral-400 whitespace-nowrap">
                  {member.affiliation}
                </td>
                <td className="py-3 px-4 text-neutral-700 dark:text-neutral-300">
                  {member.focus}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
