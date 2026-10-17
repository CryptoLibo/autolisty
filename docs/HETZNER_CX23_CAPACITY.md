# Hetzner CX23 capacity and cost boundary

Reviewed on 2026-08-30 against official Hetzner and Cloudflare documentation.

## Capacity

The CX23 provides 2 shared Intel/AMD vCPUs, 4 GB RAM, and 40 GB NVMe storage. This is sufficient for the Autolisty Next.js process, a single SQLite/WAL database, and the low-volume queue/controller workload because Photoshop, Upscayl, Autobuildy, and Automocky run on the old PC rather than on Hetzner.

SQLite stores metadata and audit history only. Design binaries and generated listing assets do not enter the SQLite file. A single intake upload is capped at 100 MB to keep peak memory bounded on the 4 GB server.

The controller must remain a single PM2 application instance while it uses SQLite. Multiple application instances would require a different coordination/database strategy.

## Included in the existing server

- The SQLite database uses the existing 40 GB primary disk.
- No managed database is required.
- No Hetzner Volume, Load Balancer, private network, or second server is required.
- EU CX cloud servers include 20 TB monthly traffic.
- Incoming traffic is not billed by Hetzner.

The implementation itself therefore adds no Hetzner resource charge to the already-running CX23.

## Optional costs

- Hetzner automatic server Backups are optional and cost 20% of the server price for seven slots.
- Snapshots are billed by compressed GB-month.
- Additional Volumes and unattached Primary IPv4 addresses are separate billable resources.
- Outgoing traffic above the included allowance is billable.

The June 2026 Hetzner list price for a new/rescaled CX23 in Germany or Finland is EUR 5.49/month excluding VAT and Primary IPv4. Existing legacy-priced instances can remain on their previous price until a change triggers current pricing, so the Hetzner invoice is the authoritative price for this particular server.

## Temporary R2 source backup

The source image waiting for the old PC is stored temporarily in the existing Cloudflare R2 Standard bucket. R2 currently includes 10 GB-month storage, 1 million Class A operations, 10 million Class B operations, and free egress per month. Deleted temporary objects stop accumulating storage; delete operations are free.

This does not guarantee a zero R2 invoice because the free tier is shared with all other Autolisty assets. At the planned listing volume, the temporary queue itself is expected to be negligible compared with the existing permanent listing assets.

## References

- https://www.hetzner.com/cloud/cost-optimized/
- https://docs.hetzner.com/cloud/billing/faq/
- https://docs.hetzner.com/cloud/general/faq/#how-much-traffic-is-included
- https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/
- https://developers.cloudflare.com/r2/pricing/
