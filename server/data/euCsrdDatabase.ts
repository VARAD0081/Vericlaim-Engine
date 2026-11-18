export interface EuCsrdCompanyRecord {
  companyName: string;
  aliases: string[];
  headquarters: string;
  sector: string;
  csrdReportingScope: string;
  esrsE1Climate: string;
  esrsE5Circularity: string;
  lcaMethodology: string;
  thirdPartyVerifier: string;
  officialReferenceUrl: string;
  directiveComplianceNote: string;
}

export const EU_CSRD_DATABASE: EuCsrdCompanyRecord[] = [
  {
    companyName: "Shell plc",
    aliases: ["shell", "royal dutch shell", "shell plc"],
    headquarters: "United Kingdom / Netherlands Operations",
    sector: "Oil, Gas & Energy",
    csrdReportingScope: "CSRD / ESRS E1 Transition Plan & Scope 1/2/3 GHG Inventory",
    esrsE1Climate: "Discloses Scope 1 & 2 (~57M tCO2e) alongside ~1,100M+ tCO2e Scope 3 Category 11 customer use-phase emissions.",
    esrsE5Circularity: "Chemical recycling & biofuel feedstock disclosures reported separately from upstream hydrocarbon volume.",
    lcaMethodology: "Well-to-wheel LCA required under EU Fuel Quality & Green Claims Art. 3; offset-based 'carbon-neutral' fuel claims restricted by EU EmpCo (2024/825).",
    thirdPartyVerifier: "EY (Limited Assurance on Sustainability Report KPIs); EU GCD Art. 10 requires ex-ante accredited verifier for consumer green claims.",
    officialReferenceUrl: "https://www.shell.com/sustainability/sustainability-reporting-and-performance-data.html",
    directiveComplianceNote: "Dutch Advertising Code Committee & EU EmpCo prohibit 'Drive Carbon Neutral' offset-reliant marketing without direct abatement proof.",
  },
  {
    companyName: "Unilever plc",
    aliases: ["unilever", "unilever plc", "unilever nv"],
    headquarters: "UK / EU Market (Netherlands/EU Operations)",
    sector: "Consumer Goods (FMCG)",
    csrdReportingScope: "ESRS E1 (Climate), E3 (Water), E5 (Resource Use & Circular Economy)",
    esrsE1Climate: "SBTi-validated near-term targets; discloses Scope 1, 2 & full Scope 3 value chain emissions.",
    esrsE5Circularity: "Tracks virgin plastic reduction, PCR % share, and actual technical recyclability by EU member state.",
    lcaMethodology: "Product Environmental Footprint (PEF) & ISO 14040/14044 LCA frameworks applied to high-volume SKU footprints.",
    thirdPartyVerifier: "KPMG / PwC Sustainability Assurance (ISAE 3000); subject to EU GCD Art. 10 pre-verification for explicit product claims.",
    officialReferenceUrl: "https://www.unilever.com/sustainability/reporting-and-verification/",
    directiveComplianceNote: "UK CMA & EU CPC authorities require generic 'eco' or 'plastic-free' claims to specify exact product component and PCR %.",
  },
  {
    companyName: "Danone S.A.",
    aliases: ["danone", "danone sa", "danone s.a."],
    headquarters: "France (EU)",
    sector: "Food, Dairy & Beverages",
    csrdReportingScope: "Full EU CSRD / ESRS E1 Climate, E3 Water, E4 Biodiversity, E5 Packaging",
    esrsE1Climate: "FLAG (Forest, Land and Agriculture) & methane reduction targets disclosed under ESRS E1.",
    esrsE5Circularity: "Tracks rPET / PCR % packaging share across Evian, Volvic, and dairy lines.",
    lcaMethodology: "Cradle-to-grave LCA (ISO 14040 / PEF) required before asserting packaging or water stewardship superiority.",
    thirdPartyVerifier: "Independent statutory sustainability auditor under French CSRD transposition (Order No. 2023-1142).",
    officialReferenceUrl: "https://www.danone.com/sustainability.html",
    directiveComplianceNote: "Evian 'carbon-neutral' & '100% recycled' bottle claims have faced EU/UK/US regulatory scrutiny regarding cap/label exclusions and offsets.",
  },
  {
    companyName: "Nestlé S.A.",
    aliases: ["nestle", "nestlé", "nestle sa", "nestlé s.a."],
    headquarters: "Switzerland (EU Single Market Operations)",
    sector: "Food & Beverage",
    csrdReportingScope: "EU CSRD-aligned ESRS E1–E5 disclosures for EU subsidiaries",
    esrsE1Climate: "Scope 1, 2 & ~95% Scope 3 agricultural supply-chain emissions disclosed.",
    esrsE5Circularity: "Reports % recyclable-by-design packaging vs. actual EU municipal recycling rates.",
    lcaMethodology: "ISO 14040/14044 LCA conducted for dairy, coffee, and cocoa categories; EmpCo bans unverified 'climate-neutral' product labels.",
    thirdPartyVerifier: "EY Independent Assurance Statement (ISAE 3000).",
    officialReferenceUrl: "https://www.nestle.com/sustainability",
    directiveComplianceNote: "Under EU EmpCo & GCD Art. 3, 'climate-neutral' via carbon credits cannot be displayed on EU consumer food packaging.",
  },
  {
    companyName: "Volkswagen AG",
    aliases: ["volkswagen", "vw", "volkswagen ag", "volkswagen group"],
    headquarters: "Germany (EU)",
    sector: "Automotive Manufacturing",
    csrdReportingScope: "EU CSRD / ESRS E1 (2030/2050 Decarbonization & Fleet Inventory), E5 (Battery Circularity)",
    esrsE1Climate: "Published Sustainability Report & Decarbonization Pathway targets a 30% lifecycle CO2 reduction per vehicle by 2030 (vs. 2018 baseline) and net carbon neutrality across the Group by 2050 (SBTi-aligned Scope 1, 2 & Scope 3 Category 11).",
    esrsE5Circularity: "EU Battery Regulation (2023/1542) mandatory recycled cobalt/lithium/nickel tracking & closed-loop battery passport.",
    lcaMethodology: "ISO 14040/14044 cradle-to-grave EV vs. ICE LCA (battery cell cathode manufacturing & EU grid electricity mix).",
    thirdPartyVerifier: "TÜV NORD & EY Independent Assurance under German CSRD (ESRS E1–E5) & EU GCD Art. 10 rules.",
    officialReferenceUrl: "https://www.volkswagen-group.com/en/sustainability-15759",
    directiveComplianceNote: "Annual Group Sustainability Report & 2030/2050 BEV transition filings support directional decarbonization claims; SKU-level 'zero-emission' labels require lifecycle grid qualification under EU EmpCo.",
  },
  {
    companyName: "TotalEnergies SE",
    aliases: ["totalenergies", "total", "totalenergies se"],
    headquarters: "France (EU)",
    sector: "Energy & Petrochemicals",
    csrdReportingScope: "EU CSRD / ESRS E1 Climate & Transition Plan",
    esrsE1Climate: "Scope 1, 2 & ~350M+ tCO2e Scope 3 emissions; EU Taxonomy capex alignment %, fossil vs. renewables.",
    esrsE5Circularity: "Bio-polymers and circular feedstock capacity disclosed.",
    lcaMethodology: "EU GCD Art. 3 requires full lifecycle comparison rather than selective renewable CapEx framing.",
    thirdPartyVerifier: "Statutory sustainability auditor under French CSRD framework.",
    officialReferenceUrl: "https://totalenergies.com/sustainability",
    directiveComplianceNote: "Active French & EU litigation/advertising scrutiny over 'Net Zero by 2050' vs. hydrocarbon expansion claims.",
  },
  {
    companyName: "L'Oréal S.A.",
    aliases: ["loreal", "l'oreal", "l'oréal", "l'oreal sa"],
    headquarters: "France (EU)",
    sector: "Cosmetics & Personal Care",
    csrdReportingScope: "Full EU CSRD / ESRS E1–E5",
    esrsE1Climate: "Scope 1, 2 & 3 disclosed; 90%+ renewable energy at industrial sites.",
    esrsE5Circularity: "Tracks % bio-based, traceable, and PCR packaging across consumer products.",
    lcaMethodology: "Product Impact Labeling (PIL) scoring system built on EU PEF (Product Environmental Footprint) methodology.",
    thirdPartyVerifier: "Deloitte / Mazars Independent Assurance under French CSRD + third-party LCA validation.",
    officialReferenceUrl: "https://www.loreal.com/en/commitments-and-responsibilities/for-the-planet/",
    directiveComplianceNote: "PIL A–E grades must comply with EU GCD Art. 7 environmental labeling governance and independent verification.",
  },
  {
    companyName: "Adidas AG",
    aliases: ["adidas", "adidas ag"],
    headquarters: "Germany (EU)",
    sector: "Apparel & Footwear",
    csrdReportingScope: "EU CSRD / ESRS E1 & E5",
    esrsE1Climate: "Scope 1, 2 & Scope 3 Tier 1–4 textile supply-chain emissions disclosed.",
    esrsE5Circularity: "Tracks % recycled polyester share (rPET) vs. virgin polyester.",
    lcaMethodology: "ISO 14040 / Apparel PEFCR lifecycle methodology required for 'made with ocean plastic' or 'sustainable' apparel claims.",
    thirdPartyVerifier: "PwC Independent Sustainability Assurance; German UWG & EU GCD enforcement requires explicit % recycled fiber disclosure.",
    officialReferenceUrl: "https://www.adidas-group.com/en/sustainability/reporting/sustainability-reports/",
    directiveComplianceNote: "Under EU EmpCo, '100% recycled' claims apply only if non-recycled trims/soles are explicitly excluded or quantified.",
  },
  {
    companyName: "Siemens AG",
    aliases: ["siemens", "siemens ag"],
    headquarters: "Germany (EU)",
    sector: "Industrial Automation & Energy Technology",
    csrdReportingScope: "EU CSRD / ESRS E1–E5 & EU Taxonomy Alignment",
    esrsE1Climate: "Scope 1, 2 & Scope 3 product use-phase emissions alongside EU Taxonomy aligned revenue %.",
    esrsE5Circularity: "Eco-design product passports & EcoTech labels mapped to ESRS E5.",
    lcaMethodology: "ISO 14040 / IEC 62430 Eco-design & Environmental Product Declarations (EPDs).",
    thirdPartyVerifier: "Independent statutory CSRD assurance + ISO 14025 Type III EPD verification.",
    officialReferenceUrl: "https://www.siemens.com/global/en/company/sustainability.html",
    directiveComplianceNote: "B2B efficiency claims must cite specific baseline IEC/ISO standards to satisfy EU Green Claims Directive substantiation.",
  },
  {
    companyName: "Schneider Electric SE",
    aliases: ["schneider", "schneider electric", "schneider electric se"],
    headquarters: "France (EU)",
    sector: "Energy Management & Automation",
    csrdReportingScope: "EU CSRD / ESRS E1–E5",
    esrsE1Climate: "SBTi Net-Zero validated Scope 1, 2 & 3 targets with quarterly SSI scorecard.",
    esrsE5Circularity: "Green Premium™ product environmental profiles & circularity take-back metrics.",
    lcaMethodology: "ISO 14040/14044 Product Environmental Profiles (PEP ecopassport®) verified per SKU.",
    thirdPartyVerifier: "Mazars / PwC CSRD statutory assurance + PEP ecopassport® independent verification.",
    officialReferenceUrl: "https://www.se.com/ww/en/about-us/sustainability/",
    directiveComplianceNote: "Private sustainability labels like 'Green Premium' must meet EU GCD Art. 7 & Art. 10 accredited verification criteria.",
  },
  {
    companyName: "BMW Group (Bayerische Motoren Werke AG)",
    aliases: ["bmw", "bmw group", "bayerische motoren werke"],
    headquarters: "Germany (EU)",
    sector: "Automotive Manufacturing",
    csrdReportingScope: "EU CSRD / ESRS E1–E5 & EU Battery Passport",
    esrsE1Climate: "Published CSRD Report targets -40% lifecycle CO2 per vehicle by 2030 (vs. 2019) and net-zero value chain by 2050 across Scope 1, 2 & Scope 3 Category 11.",
    esrsE5Circularity: "Tracks secondary aluminum/cobalt/steel content & closed-loop vehicle recycling under ESRS E5.",
    lcaMethodology: "ISO 14040/14044 cradle-to-grave vehicle LCA verified per model line.",
    thirdPartyVerifier: "PwC Independent Assurance Statement (ISAE 3000) covering BMW Group Report Sustainability KPIs.",
    officialReferenceUrl: "https://www.bmwgroup.com/en/sustainability.html",
    directiveComplianceNote: "Verified 2030/2050 decarbonization targets back directional EV climate positioning under ESRS E1; consumer ads still avoid offset-neutral phrasing.",
  },
  {
    companyName: "Mercedes-Benz Group AG",
    aliases: ["mercedes", "mercedes-benz", "mercedes benz", "daimler"],
    headquarters: "Germany (EU)",
    sector: "Automotive Manufacturing",
    csrdReportingScope: "EU CSRD / ESRS E1 & Ambition 2039 Transition Plan",
    esrsE1Climate: "Targets 80% Scope 1 & 2 reduction by 2030, 100% renewable own-plant power, and net carbon-neutral new vehicle fleet by 2039.",
    esrsE5Circularity: "Secondary raw materials share & closed-loop battery recycling facilities reported under ESRS E5.",
    lcaMethodology: "ISO 14040/14044 vehicle LCA audited by TÜV SÜD.",
    thirdPartyVerifier: "KPMG / TÜV SÜD Independent Assurance Statement (ISAE 3000).",
    officialReferenceUrl: "https://group.mercedes-benz.com/sustainability/",
    directiveComplianceNote: "Annual Sustainability Report & TÜV SÜD LCAs back fleet decarbonization claims; explicit model-level disclaimers required under EU EmpCo.",
  },
  {
    companyName: "IKEA (Ingka Group B.V.)",
    aliases: ["ikea", "ingka", "ingka group"],
    headquarters: "Netherlands / Sweden (EU)",
    sector: "Home Furnishings & Retail",
    csrdReportingScope: "EU CSRD-aligned Sustainability Report (Climate, Circularity & Forestry)",
    esrsE1Climate: "SBTi-validated target to halve absolute GHG emissions across the full value chain by FY30 (vs. FY16) and reach net zero by 2050.",
    esrsE5Circularity: "Discloses >97% FSC-certified or recycled wood sourcing alongside circular product design share.",
    lcaMethodology: "ISO 14040/14044 & EU PEF product footprint modeling across high-volume furniture SKUs.",
    thirdPartyVerifier: "KPMG Independent Assurance Report on Annual Sustainability KPIs & FSC Chain-of-Custody certification.",
    officialReferenceUrl: "https://www.ikea.com/global/en/our-business/reports/",
    directiveComplianceNote: "Published FY30/2050 SBTi climate reports & FSC audits substantiate supply-chain sustainability claims; SKU labels must avoid offset-only neutrality.",
  },
  {
    companyName: "SAP SE",
    aliases: ["sap", "sap se"],
    headquarters: "Germany (EU)",
    sector: "Enterprise Software & Cloud",
    csrdReportingScope: "Full EU CSRD / ESRS E1 Integrated Report",
    esrsE1Climate: "SBTi-validated Net-Zero by 2030 across value chain, 100% renewable electricity for data centers and buildings.",
    esrsE5Circularity: "Data-center hardware circularity & e-waste recovery programs disclosed under ESRS E5.",
    lcaMethodology: "GHG Protocol Scope 2 & Scope 3 cloud workload energy/carbon accounting.",
    thirdPartyVerifier: "BDO / KPMG Reasonable & Limited Assurance (ISAE 3000).",
    officialReferenceUrl: "https://www.sap.com/about/company/sustainability.html",
    directiveComplianceNote: "Verified 2030 Net-Zero Integrated Report & 100% renewable cloud disclosures substantiate enterprise sustainability claims.",
  },
];

export function findEuCsrdRecord(company: string): EuCsrdCompanyRecord | null {
  const q = company.trim().toLowerCase();
  if (!q) return null;
  for (const rec of EU_CSRD_DATABASE) {
    if (
      rec.companyName.toLowerCase() === q ||
      rec.aliases.some((a) => q === a || q.includes(a) || a.includes(q))
    ) {
      return rec;
    }
  }
  return null;
}
