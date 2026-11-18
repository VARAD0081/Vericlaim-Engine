#!/usr/bin/env python3
"""
SEC EDGAR 10-K & XBRL Fact Lookup using the `edgartools` Python package.
Invoked by the VeriClaim backend jurisdiction router when Python `edgartools`
is installed in the runtime environment.
"""

import json
import os
import re
import sys

def main() -> int:
    if len(sys.argv) < 2 or not sys.argv[1].strip():
        print(json.dumps({"error": "Company name or ticker is required"}))
        return 1

    query = sys.argv[1].strip()
    identity = os.environ.get(
        "SEC_EDGAR_IDENTITY",
        "TheVeriClaimEngine WoxsenResearch varadr200811@gmail.com",
    )

    try:
        from edgar import Company, find_company, set_identity
    except ImportError as exc:
        print(json.dumps({"error": f"edgartools not installed: {exc}", "fallbackRequired": True}))
        return 2

    try:
        set_identity(identity)

        company = None
        if re.fullmatch(r"[A-Za-z]{1,6}(?:[.-][A-Za-z]{1,2})?", query):
            try:
                company = Company(query.upper())
            except Exception:
                company = None

        if company is None:
            matches = find_company(query)
            if matches is not None and len(matches) > 0:
                cik = str(matches.iloc[0]["cik"]) if hasattr(matches, "iloc") else str(matches[0].cik)
                company = Company(cik)

        if company is None:
            print(json.dumps({"found": False, "query": query}))
            return 0

        filings = company.get_filings(form="10-K")
        latest_10k = filings.latest() if filings else None

        facts_summary = {}
        try:
            facts = company.get_facts()
            if facts is not None:
                df = facts.to_dataframe() if hasattr(facts, "to_dataframe") else None
                if df is not None and not df.empty:
                    for tag in ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "Assets", "NetIncomeLoss"]:
                        rows = df[df["concept"].str.contains(tag, na=False)]
                        if not rows.empty:
                            latest_row = rows.sort_values("end", ascending=False).iloc[0]
                            facts_summary[tag] = {
                                "value": float(latest_row["val"]) if latest_row["val"] is not None else None,
                                "unit": str(latest_row.get("unit", "USD")),
                                "end": str(latest_row.get("end", "")),
                            }
        except Exception:
            pass

        climate_mentions = []
        filing_url = ""
        filing_date = ""
        report_date = ""
        accession_no = ""

        if latest_10k is not None:
            filing_date = str(getattr(latest_10k, "filing_date", ""))
            report_date = str(getattr(latest_10k, "report_date", ""))
            accession_no = str(getattr(latest_10k, "accession_no", ""))
            filing_url = str(getattr(latest_10k, "filing_url", getattr(latest_10k, "url", "")))
            try:
                text = latest_10k.text()[:250000]
                for kw in ["Scope 1", "Scope 2", "Scope 3", "greenhouse gas", "climate change", "renewable energy", "sustainability", "emissions"]:
                    if re.search(rf"\b{re.escape(kw)}\b", text, re.IGNORECASE):
                        climate_mentions.append(kw)
            except Exception:
                pass

        payload = {
            "found": True,
            "source": "edgartools",
            "identity": identity,
            "cik": str(getattr(company, "cik", "")).zfill(10),
            "name": str(getattr(company, "name", query)),
            "tickers": list(getattr(company, "tickers", []) or []),
            "sicDescription": str(getattr(company, "sic_description", "")),
            "latest10K": {
                "form": "10-K",
                "filingDate": filing_date,
                "reportDate": report_date,
                "accessionNumber": accession_no,
                "url": filing_url,
                "climateKeywordsFound": climate_mentions,
            } if latest_10k is not None else None,
            "xbrlFacts": facts_summary,
        }
        print(json.dumps(payload))
        return 0
    except Exception as exc:
        print(json.dumps({"error": str(exc), "fallbackRequired": True}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
