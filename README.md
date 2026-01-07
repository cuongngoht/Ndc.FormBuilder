# Ndc Form Builder

A type-safe, reactive form library for React with declarative conditional logic.

## First Principles

### 1. **Separation of State and UI**

Form state lives independently from React components. Fields subscribe to only the data they need, minimizing re-renders.

### 2. **Flat Runtime, Nested Types**

```typescript
// Your type definition (compile-time)
type Address = { street: string; city: string }
type Form = { user: { name: string; address: Address } }

// Runtime storage (always flat)
{
  "user.name": "John",
  "user.address.street": "123 Main",
  "user.address.city": "NYC"
}
```

**Why?** Simple, predictable storage while preserving type safety and autocomplete.

### 3. **Fine-Grained Reactivity**

Components subscribe to specific fields. Changing `user.name` doesn't re-render `user.address.city`.

### 4. **Declarative Conditions**

Express "when X, then Y" as data structures, not imperative code:

```typescript
when<Form>((values) => v(values, (x) => x.country) === "US")
  .show((x) => x.state)
  .hide((x) => x.province);
```

### 5. **Progressive Enhancement**

- **v0**: Basic forms with validation
- **v1**: Adds conditional show/hide/set logic

---

## Quick Start

### Basic Form (v0)

```typescript
import { NdcForm, useFormField } from "@khamphamoi/form-builder";

type LoginForm = {
  email: string;
  password: string;
};

function EmailField() {
  const field = useFormField<LoginForm, "email">({
    name: "email",
    initialValue: "",
    validators: [
      (value) => (!value ? "Email required" : null),
      (value) => (!value?.includes("@") ? "Invalid email" : null),
    ],
  });

  return (
    <div>
      <input
        value={field.value ?? ""}
        onChange={(e) => field.setValue(e.target.value)}
      />
      {field.error && <span>{field.error}</span>}
    </div>
  );
}

function App() {
  return (
    <NdcForm<LoginForm> id="login" onSubmit={(values) => console.log(values)}>
      <EmailField />
      {/* more fields... */}
      <button type="submit">Login</button>
    </NdcForm>
  );
}
```

### Conditional Form (v1)

```typescript
import { NdcForm, when, v } from "@khamphamoi/form-builder";

type ShippingForm = {
  country: string;
  state?: string;
  province?: string;
};

const conditions = [
  // Show 'state' only for US
  when<ShippingForm>((values) => v(values, (x) => x.country) === "US")
    .show((x) => x.state)
    .hide((x) => x.province)
    .toRules(),

  // Show 'province' only for Canada
  when<ShippingForm>((values) => v(values, (x) => x.country) === "CA")
    .show((x) => x.province)
    .hide((x) => x.state)
    .toRules(),
].flat();

function App() {
  return (
    <NdcForm<ShippingForm> id="shipping" version="v1" conditions={conditions}>
      <CountryField />
      <StateField /> {/* auto-hidden unless country=US */}
      <ProvinceField /> {/* auto-hidden unless country=CA */}
    </NdcForm>
  );
}
```

---

## Core Concepts

### Field Paths

Access nested fields using dot notation:

```typescript
type Form = {
  user: {
    profile: {
      name: string;
    };
  };
};

// Field path: "user.profile.name"
const field = useFormField<Form, "user.profile.name">({
  name: "user.profile.name",
  initialValue: "",
});
```

### Validators

Two styles supported:

```typescript
// Legacy validator (value only)
const required = (value: string) => (!value ? "Required" : null);

// Typed validator (value + all form values)
const matchPassword: TypedValidator<string, Form> = (value, values) =>
  value !== values.password ? "Passwords must match" : null;
```

**Validation Rules:**

1. Hidden fields are **never validated**
2. Disabled fields **are validated** (unless also hidden)
3. Validation runs on:
   - Field blur
   - Form submit
   - Manual `field.validate()` call

### Form API

Access form programmatically via ref:

```typescript
const formRef = useRef<TypedFormApi<MyForm>>(null);

<NdcForm ref={formRef} id="myform">
  {/* fields */}
</NdcForm>;

// Later:
formRef.current?.email.set("user@example.com");
formRef.current?.validateAll();
const values = formRef.current?.getValues();
```

---

## Conditional Logic (v1)

### Condition DSL

```typescript
when<FormShape>(predicate)
  .show(field) // Make field visible
  .hide(field) // Make field invisible
  .enable(field) // Enable field
  .disable(field) // Disable field
  .setValue(field, value) // Set field value
  .clear(field) // Clear field value
  .else() // Branch to opposite condition
  .toRules(); // Convert to runtime rules
```

### Reading Values in Predicates

Use the `v()` helper for type-safe value access:

```typescript
when<Form>((values) => v(values, (x) => x.shippingMethod) === "express").show(
  (x) => x.deliveryDate
);
```

**Why `v()`?** It enables:

1. Type safety (autocomplete on `x.shippingMethod`)
2. Refactor safety (rename detection)
3. Runtime efficiency (accesses flat storage correctly)

### Complex Conditions

```typescript
// Multiple effects
when<Form>((values) => v(values, (x) => x.hasDiscount))
  .show((x) => x.discountCode)
  .enable((x) => x.applyDiscount)
  .setValue((x) => x.discountPercent, 10)
  .toRules();

// Computed values
when<Form>((values) => v(values, (x) => x.quantity) > 10)
  .setValue(
    (x) => x.total,
    (values) => v(values, (x) => x.quantity) * v(values, (x) => x.price) * 0.9
  )
  .toRules();

// If/else branching
when<Form>((values) => v(values, (x) => x.paymentType) === "credit")
  .show((x) => x.cardNumber)
  .else()
  .show((x) => x.bankAccount)
  .toRules();
```

### Priority

When conditions conflict, higher priority wins:

```typescript
when<Form>(/* condition */)
  .show((x) => x.field)
  .withPriority(10) // This takes precedence over priority 5
  .toRules();
```

---

## Advanced Patterns

### Section Visibility

Group fields into sections:

```typescript
import { NdcSection } from "@khamphamoi/form-builder";

<NdcSection<Form> name="billing" label="Billing Address">
  <StreetField />
  <CityField />
</NdcSection>;

// Hide entire section
when<Form>((values) => v(values, (x) => x.sameAsShipping))
  .hide("billing")
  .toRules();
```

**Cascade Rule:** Hiding a parent automatically hides all children and prevents their validation.

### Custom Field Components

```typescript
function TextField<TShape, P extends FieldPath<TShape>>({
  name,
  label,
  validators,
}: NdcFieldProps<TShape, P, { label: string }>) {
  const field = useFormField<TShape, P>({
    name,
    initialValue: "" as any,
    validators,
  });

  return (
    <div>
      <label>{label}</label>
      <input
        value={field.value ?? ""}
        onChange={(e) => field.setValue(e.target.value as any)}
      />
      {field.error && <span className="error">{field.error}</span>}
    </div>
  );
}

// Usage:
<TextField<Form, "email">
  name="email"
  label="Email Address"
  validators={[required, validEmail]}
/>;
```

### Dynamic Forms

```typescript
function DynamicForm() {
  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
    <NdcForm<Form> id="dynamic">
      <BasicFields />

      {showAdvanced && <AdvancedFields />}
      {/* Fields register/unregister automatically */}

      <button type="button" onClick={() => setShowAdvanced(!showAdvanced)}>
        Toggle Advanced
      </button>
    </NdcForm>
  );
}
```

---

## Architecture Principles

### 1. **Store Design**

```typescript
// Single source of truth
{
  values: Record<string, unknown>,      // Field values
  errors: Record<string, string | null>, // Validation errors
  meta: Record<string, FieldMeta>,      // Visibility/enabled state
  validators: Record<string, Validator[]>
}
```

### 2. **Subscription System**

Fields subscribe to changes:

```typescript
api.subscribeValue("email", () => rerender()); // Value changes
api.subscribeError("email", () => rerender()); // Error changes
api.subscribe(() => rerender()); // Any change (global)
```

### 3. **Condition Evaluation**

```
User types → Values change → Conditions re-evaluate →
Meta updates → Fields show/hide → Validation re-runs
```

**Optimization:** Conditions only run when subscribed values change.

### 4. **Type Safety via Proxy**

```typescript
// Instead of:
formRef.current.getValue("email");

// You write:
formRef.current.email.value; // Fully typed!
```

The Proxy intercepts property access and maps it to the correct API calls.

---

## Migration Guide

### From v0 to v1

```typescript
// Before (v0)
<NdcForm<Form> id="form">{country === "US" && <StateField />}</NdcForm>;

// After (v1)
const conditions = [
  when<Form>((values) => v(values, (x) => x.country) === "US")
    .show((x) => x.state)
    .toRules(),
].flat();

<NdcForm<Form> id="form" version="v1" conditions={conditions}>
  <StateField /> {/* Always rendered, visibility controlled by conditions */}
</NdcForm>;
```

**Benefits:**

- Declarative (easier to test/reason about)
- Automatic validation gating
- No manual state management
- Serializable (can save/load condition rules)

---

## Best Practices

### 1. **Colocate Field Components**

```typescript
// Good: Self-contained field
function EmailField() {
  const field = useFormField<Form, 'email'>({
    name: 'email',
    initialValue: '',
    validators: [required, validEmail]
  });

  return <input {.../* field bindings */} />;
}
```

### 2. **Extract Reusable Validators**

```typescript
const required = (value: any) => (!value ? "Required" : null);
const minLength = (min: number) => (value: string) =>
  value.length < min ? `Min ${min} characters` : null;
```

### 3. **Use Sections for Grouping**

```typescript
<PTSection name="address" label="Address">
  <StreetField />
  <CityField />
</PTSection>
```

### 4. **Flatten Conditions**

```typescript
// Multiple conditions for same field
const conditions = [
  when<Form>(/* condition A */).show("field").toRules(),
  when<Form>(/* condition B */).hide("field").toRules(),
].flat(); // Flatten into single array
```

### 5. **Validate on Submit**

```typescript
<NdcForm
  onSubmit={values => {
    // This only runs if validateAll() passes
    submitToServer(values);
  }}
>
```

---

## Philosophy

**Ndc** follows these design principles:

1. **Type Safety Without Runtime Cost** - Full TypeScript support with zero runtime type checks
2. **Explicit Over Implicit** - Clear APIs, no magic
3. **Composition Over Configuration** - Build complex forms from simple pieces
4. **Declarative Conditions** - What, not how
5. **Performance by Default** - Fine-grained subscriptions prevent unnecessary renders

The name "Ndc" suggests a form that acts as a communication portal - gathering structured data from users through a conversational, reactive interface.

---

## API Reference

### `<NdcForm>`

| Prop         | Type                     | Description                 |
| ------------ | ------------------------ | --------------------------- |
| `id`         | `string`                 | Unique form identifier      |
| `version`    | `'v0' \| 'v1'`           | Form version (default: v0)  |
| `conditions` | `UntypedConditionRule[]` | Conditional logic (v1 only) |
| `onSubmit`   | `(values) => void`       | Submit handler              |
| `children`   | `ReactNode`              | Form fields                 |

### `useFormField()`

```typescript
function useFormField<TShape, P extends FieldPath<TShape>>(opts: {
  name: P;
  initialValue: FieldPathValue<TShape, P>;
  validators?: Validator[];
}): {
  name: string;
  value: T | undefined;
  error: string | null;
  setValue(value: T): void;
  validate(): string | null;
};
```

### Condition DSL

```typescript
when<TShape>(predicate: (values: FormValues<TShape>) => boolean)
  .show(field: FieldPath<TShape> | ((x: TShape) => any))
  .hide(field)
  .enable(field)
  .disable(field)
  .setValue<P>(field: P, value: FieldPathValue<TShape, P>)
  .clear(field)
  .withPriority(n: number)
  .else()
  .toRules(): UntypedConditionRule[]
```

---

## Examples Repository

See `/examples` for:

- Multi-step wizard
- Dynamic array fields
- Conditional sections
- Custom field libraries
- Form persistence
- Server-side validation

---

### Install pnpm

```bash
npm install -g pnpm
```

### Install Azure npm authentication helper

```bash
npm install -g vsts-npm-auth
```

---

## Build the Package (Maintainers)

### Install dependencies

```bash
pnpm install
```

### Build

```bash
pnpm build
npm version prerelease --preid=beta
```

```bash
const checkEmailExists = async (email?: string) => {
  if (!email) return null;
  const exists = await backend.emailExists(email);
  return exists ? "Email already exists" : null;
};

// Attach from outside UI:
formApi.setValidators("user.email", [checkEmailExists]);
```

## License

MIT
