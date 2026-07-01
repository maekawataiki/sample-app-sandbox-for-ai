# Cedar Authorization Policies

Place `.cedar` policy files here to control access to this service.

When **no** `.cedar` files are present, all Cognito-authenticated users have full access (default behavior).

When **any** `.cedar` file is present, the default policy is disabled and only your explicit policies apply.

## Example: restrict to engineering group only

```cedar
permit(
  principal in Prototype::Group::"engineering",
  action,
  resource
);
```

## Example: read-only for viewers, full access for admins

```cedar
permit(
  principal in Prototype::Group::"admin",
  action,
  resource
);

permit(
  principal in Prototype::Group::"viewer",
  action in [Prototype::Action::"HttpGet"],
  resource
);
```

## Example: block DELETE for everyone except admins

```cedar
permit(principal is Prototype::User, action, resource);

forbid(
  principal,
  action == Prototype::Action::"HttpDelete",
  resource
) unless {
  principal in Prototype::Group::"admin"
};
```

## Available actions

- `Prototype::Action::"HttpGet"`
- `Prototype::Action::"HttpPost"`
- `Prototype::Action::"HttpPut"`
- `Prototype::Action::"HttpDelete"`
- `Prototype::Action::"HttpPatch"`

## Cognito groups

Users are placed in groups via the AWS Cognito console or CLI.
The group name in Cedar matches the Cognito group name exactly.

## Validation

Policies are validated against the Cedar schema at CI build time.
Run locally with: `npx cedar-auth-validate --policy-dir ./cedar`
