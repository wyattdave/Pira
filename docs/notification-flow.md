# Pira — optional email/Teams notification flow

Pira's in-app notifications work without this flow. Each notification is a row in **Notifications** (`wd_notification`) that starts with *Delivery State* = **Pending**, so the table doubles as an **outbox**: a Power Automate cloud flow can pick rows up and send an email or Teams message to people who asked for one (Notification settings → *Also send*).

The flow is outside the critical path. Issue saves never wait for it, and a failed or missing flow never undoes or blocks a save.

## What the app writes

| Column | Content |
|---|---|
| Recipient (`wd_recipient`) | The person to tell. Always an active member of the project (plug-in 24). Never the person who made the change. |
| Issue (`wd_issue`) | The issue, if there is one. Its display value is the **issue key**, not the summary. Bulk-edit summaries have no issue. |
| Project (`wd_project`) | The project. |
| Event Type (`wd_eventtype`) | Assigned · Mentioned · Status Changed · Commented · Bulk Changed |
| Detail (`wd_detail`) | A short safe phrase, e.g. `In Progress → Done`, `assigned you`, `3 of your issues changed: Priority → High`. No summaries, descriptions or comment text. |
| Item Count (`wd_itemcount`) | Number of issues in a bulk summary (otherwise 1). |
| Created By | Who made the change. |
| Delivery State / Delivered On | **Pending** when written. The flow sets Sent, Skipped or Failed. |

Bulk edits write **one** summary per person instead of one notification per issue, so there's no notification storm.

## Build the flow

Create it in a solution (the Pira solution is best) so connection references and the environment variable move with it.

1. **Environment variable** `wd_PiraAppUrl` (Text): the Pira app's play URL in this environment, for example the URL you get from *Play* on the app. Never hard-code it in the flow; each environment gets its own value. Leave it blank to send messages without a link.
2. **Trigger:** Microsoft Dataverse → *When a row is added, modified or deleted*.
   - Change type: **Added**. Table: **Notifications** (the `wd_` one, not the system *Notification* table). Scope: **Organization**.
   - Filter rows: `wd_deliverystate eq 100000000`
   - Run as: the **flow owner** (a service account that is not a normal Pira user is best).
3. **List rows** on **Notification Preferences**: filter `_wd_user_value eq @{triggerOutputs()?['body/_wd_recipient_value']}`, row count 1.
4. **Condition:** if no row, or both *Send Email* and *Send Teams* are No → **Update a row** on the notification: Delivery State = **Skipped**, Delivered On = `utcNow()`. Stop.
   (The default for people with no preferences row is in-app only.)
5. Respect the in-app event switches too: skip when the matching *Notify …* column is No (Assigned → *Notify Assigned*, Mentioned → *Notify Mentioned*, Status Changed → *Notify Status*, Commented → *Notify Comments*, Bulk Changed → *Notify Bulk*).
6. **Get a row** on **Users** for the recipient (`internalemailaddress`, `azureactivedirectoryobjectid`) and for Created By (`fullname`).
7. Compose a short message from the trigger's formatted values only, for example:
   `@{actor fullname} @{event text} @{_wd_issue_value@OData.Community.Display.V1.FormattedValue} in @{_wd_project_value@OData.Community.Display.V1.FormattedValue}: @{wd_detail}`
   and, if `wd_PiraAppUrl` is set, a link `@{parameters('wd_PiraAppUrl')}#/browse/@{issue key}`. The recipient opens the issue in Pira, where Dataverse checks their own access.
   **Don't add the issue summary or description to the message.** Email and Teams don't know who is allowed to see what.
8. If *Send Email*: Office 365 Outlook → *Send an email (V2)* to the recipient's email.
   If *Send Teams*: Microsoft Teams → *Post message in a chat or channel* (Post as: Flow bot, Post in: Chat with Flow bot, Recipient: the recipient's email).
9. **Update a row** on the notification: Delivery State = **Sent**, Delivered On = `utcNow()`.
10. Add a parallel branch after steps 8–9 that runs **only if they failed** (*Configure run after → has failed / timed out*) and sets Delivery State = **Failed**. Keep the default retry policy on the send actions.

## Connections and security

- **Connection references** (in the solution): Microsoft Dataverse, Office 365 Outlook, Microsoft Teams. Point them at a service account in each environment during import.
- The flow's Dataverse identity needs Read on Notifications, Notification Preferences, Users, Projects and Issues (for display values), and Write on Notifications. Plug-in 25 lets it change *Delivery State* and *Delivered On* only; the content of a notification can't change and only the recipient can mark it read.
- The flow sees every notification. Treat its owner account like an admin account: no interactive sign-in, and only the privileges above.
- Turning email/Teams off: switch the flow off. Rows stay Pending; in-app notifications keep working.

## Testing

1. Turn on *Email* in your Notification settings.
2. Ask a teammate to assign an issue to you. Within a minute: one email, the notification row shows **Sent**.
3. Turn *Email* and *Teams* off → the next notification row shows **Skipped**, no email.
4. Bulk edit 10 issues assigned to a teammate → they get one message, not ten.
5. Break the Outlook connection → the row shows **Failed**; the issue change in Pira is saved regardless.
