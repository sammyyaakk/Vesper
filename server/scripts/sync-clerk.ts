// Local development only: replays Clerk users and organizations into the local
// Inngest dev server as the same events Clerk's webhooks would deliver.
// Clerk can't reach localhost, so without this nothing gets synced into Postgres.
//
// Usage (from server/):
//   npm run sync:clerk                       list Clerk users and organizations
//   npm run sync:clerk -- send <orgId> ...   send clerk/user.created for every user
//                                            and clerk/organization.created for each given org
import "dotenv/config";

const INNGEST_DEV_URL = process.env.INNGEST_DEV_URL || "http://localhost:8288";

if (process.env.NODE_ENV === "production") {
    console.error("sync-clerk is a local development tool; refusing to run with NODE_ENV=production.");
    process.exit(1);
}

// Only the fields this script reads; the full payloads are forwarded to Inngest unchanged
interface ClerkUser { id: string }
interface ClerkOrganization { id: string; name: string; created_at: number }

const clerk = async <T>(path: string): Promise<T> => {
    const res = await fetch(`https://api.clerk.com/v1${path}`, {
        headers: { Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}` },
    });
    if (!res.ok) throw new Error(`Clerk API ${path} returned ${res.status}`);
    return res.json();
};

const sendEvent = async (name: string, data: unknown) => {
    const res = await fetch(`${INNGEST_DEV_URL}/e/local-dev`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, data }),
    });
    if (!res.ok) throw new Error(`Inngest dev server returned ${res.status} for ${name}`);
};

const users = await clerk<ClerkUser[]>("/users?limit=100");
const { data: orgs } = await clerk<{ data: ClerkOrganization[] }>("/organizations?limit=100");
const [mode, ...orgIds] = process.argv.slice(2);

if (mode !== "send") {
    for (const user of users) console.log("user", user.id);
    for (const org of orgs) console.log("org ", org.id, JSON.stringify(org.name), new Date(org.created_at).toISOString());
    console.log("\nTo sync: npm run sync:clerk -- send <orgId> [<orgId> ...]");
} else {
    if (orgIds.length === 0) {
        console.error("Pass at least one organization ID to send.");
        process.exit(1);
    }
    // Users are sent first because organization.created also inserts the creator's ADMIN membership,
    // which needs the user row. Inngest runs functions concurrently, so this doesn't guarantee order;
    // if the membership insert runs first, it fails and succeeds on Inngest's automatic retry.
    // Re-sending an already-synced user fails on the unique constraint; that run's error is harmless.
    for (const user of users) {
        await sendEvent("clerk/user.created", user);
        console.log("sent clerk/user.created", user.id);
    }
    for (const org of orgs.filter((o) => orgIds.includes(o.id))) {
        await sendEvent("clerk/organization.created", org);
        console.log("sent clerk/organization.created", org.id);
    }
}
