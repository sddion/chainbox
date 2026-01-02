import * as jose from "jose";

async function gen() {
  const args = process.argv.slice(2);
  const sub = args[0] || "user-rls-test-123";
  const email = args[1] || "test@example.com";
  const role = args[2] || "authenticated";
  const tenant_id = args[3] || "test-tenant";

  console.log(`Generating token for: sub=${sub}, email=${email}, role=${role}, tenant=${tenant_id}`);

  const secret = new TextEncoder().encode("default-secret-change-me");
  const jwt = await new jose.SignJWT({ 
    sub, 
    email,
    role,
    tenant_id
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("2h")
    .sign(secret);
  
  console.log(jwt);
}

gen();
