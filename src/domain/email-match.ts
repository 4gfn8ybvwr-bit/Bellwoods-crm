const PUBLIC_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "hotmail.co.uk",
  "live.com",
  "live.co.uk",
  "yahoo.com",
  "yahoo.co.uk",
  "icloud.com",
  "me.com",
  "btinternet.com",
  "aol.com",
  "msn.com",
]);

export type MatchCustomer = { id: string; email: string; contactEmails: string[] };
export type MatchContract = { id: string; number: string; customerId: string; customerReference: string };

export type EmailMatch = {
  customerId: string | null;
  contractId: string | null;
  notes: string[];
};

export function extractContractNumbers(text: string) {
  const found = new Set<string>();
  for (const match of text.matchAll(/\b((?:BW|TC|CM)\d{4,6})\b/gi)) {
    found.add(match[1].toUpperCase());
  }
  return Array.from(found);
}

export function emailDomain(address: string) {
  const domain = address.trim().toLowerCase().split("@")[1] ?? "";
  return domain;
}

export function matchInboundEmail(input: {
  fromEmail: string;
  subject: string;
  body: string;
  customers: MatchCustomer[];
  contracts: MatchContract[];
}): EmailMatch {
  const notes: string[] = [];
  const haystack = `${input.subject}\n${input.body}`;
  const numbers = new Set(extractContractNumbers(haystack));
  const byNumber = input.contracts.filter((contract) => numbers.has(contract.number.toUpperCase()));
  const from = input.fromEmail.trim().toLowerCase();
  const emailCustomers = input.customers.filter((customer) => {
    const addresses = [customer.email, ...customer.contactEmails].map((item) => item.trim().toLowerCase()).filter(Boolean);
    return addresses.includes(from);
  });

  let contract: MatchContract | undefined;
  if (byNumber.length === 1) {
    contract = byNumber[0];
    notes.push(`Matched contract ${contract.number} in the message`);
  } else if (byNumber.length > 1) {
    notes.push("More than one contract number was mentioned");
  }

  if (!contract) {
    const lowered = haystack.toLowerCase();
    const byRef = input.contracts.filter((item) => {
      const ref = item.customerReference.trim().toLowerCase();
      return ref.length >= 3 && lowered.includes(ref);
    });
    if (byRef.length === 1) {
      contract = byRef[0];
      notes.push(`Matched customer reference ${contract.customerReference}`);
    } else if (byRef.length > 1) {
      const narrowed = emailCustomers.length === 1 ? byRef.filter((item) => item.customerId === emailCustomers[0].id) : [];
      if (narrowed.length === 1) {
        contract = narrowed[0];
        notes.push(`Matched customer reference ${contract.customerReference} for the sender`);
      } else {
        notes.push("More than one customer reference matched");
      }
    }
  }

  let customerId: string | null = contract?.customerId ?? null;
  if (emailCustomers.length === 1) {
    if (customerId && customerId !== emailCustomers[0].id) {
      notes.push("Sender email belongs to a different customer from the contract; the contract customer was kept");
    } else {
      customerId = emailCustomers[0].id;
      notes.push("Matched the sender email address");
    }
  } else if (!customerId && emailCustomers.length > 1) {
    notes.push("Sender email matches more than one customer");
  }

  if (!customerId) {
    const domain = emailDomain(from);
    if (domain && !PUBLIC_DOMAINS.has(domain)) {
      const byDomain = input.customers.filter((customer) => {
        const domains = [customer.email, ...customer.contactEmails].map(emailDomain).filter(Boolean);
        return domains.includes(domain);
      });
      if (byDomain.length === 1) {
        customerId = byDomain[0].id;
        notes.push(`Matched the sender domain ${domain}`);
      } else if (byDomain.length > 1) {
        notes.push(`Several customers use @${domain}`);
      }
    }
  }

  if (!customerId && !contract) notes.push("No customer or job matched");
  return { customerId, contractId: contract?.id ?? null, notes };
}
