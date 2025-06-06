# GraphQL Queries for Auto-Install Notification Control

## 🔍 **Query 1: Check if notification is dismissed**

```graphql
query {
  currentAppInstallation {
    metafields(first: 10, namespace: "ui_state") {
      nodes {
        id
        key
        value
        type
        namespace
        createdAt
        updatedAt
      }
    }
  }
}
```

## 🔍 **Query 2: Check specific notification_dismissed status**

```graphql
query {
  currentAppInstallation {
    metafields(first: 1, namespace: "ui_state", key: "notification_dismissed") {
      nodes {
        id
        key
        value
        type
        namespace
        createdAt
        updatedAt
      }
    }
  }
}
```

## ✅ **Mutation 1: Hide notification (dismiss)**

```graphql
mutation {
  metafieldsSet(metafields: [{
    namespace: "ui_state"
    key: "notification_dismissed"
    value: "true"
    type: "single_line_text_field"
  }]) {
    metafields {
      id
      key
      value
      type
      namespace
    }
    userErrors {
      field
      message
    }
  }
}
```

## 🔄 **Mutation 2: Show notification again (un-dismiss)**

```graphql
mutation {
  metafieldsSet(metafields: [{
    namespace: "ui_state"
    key: "notification_dismissed"
    value: "false"
    type: "single_line_text_field"
  }]) {
    metafields {
      id
      key
      value
      type
      namespace
    }
    userErrors {
      field
      message
    }
  }
}
```

## 🗑️ **Mutation 3: Delete notification metafield (reset to default)**

```graphql
mutation {
  metafieldsDelete(metafields: [{
    namespace: "ui_state"
    key: "notification_dismissed"
  }]) {
    deletedMetafields {
      key
      namespace
    }
    userErrors {
      field
      message
    }
  }
}
```

## 🔍 **Query 3: Check auto-install status**

```graphql
query {
  currentAppInstallation {
    metafields(first: 10, namespace: "auto_install") {
      nodes {
        id
        key
        value
        type
        namespace
        createdAt
        updatedAt
      }
    }
  }
}
```

## 🔄 **Mutation 4: Reset auto-install status (force re-attempt)**

```graphql
mutation {
  metafieldsDelete(metafields: [{
    namespace: "auto_install"
    key: "block_installed"
  }]) {
    deletedMetafields {
      key
      namespace
    }
    userErrors {
      field
      message
    }
  }
}
```

## 🔍 **Query 4: Get all app metafields (overview)**

```graphql
query {
  currentAppInstallation {
    metafields(first: 50) {
      nodes {
        id
        key
        value
        type
        namespace
        createdAt
        updatedAt
      }
    }
  }
}
```

---

## 📍 **How to use in GraphiQL:**

### **Option 1: Shopify Partners Dashboard**
1. Go to your app in Partners Dashboard
2. Click "App setup" → "App extensions" 
3. Open GraphiQL tool

### **Option 2: Shopify Admin GraphiQL**
1. Go to your development store
2. Navigate to: `https://your-store.myshopify.com/admin/settings/applications/private`
3. Open GraphiQL for your app

### **Option 3: Local development**
1. Use Shopify CLI: `shopify app dev`
2. Open the GraphiQL link provided in terminal

---

## 🎯 **Common use cases:**

### **Hide notification permanently:**
```graphql
mutation {
  metafieldsSet(metafields: [{
    namespace: "ui_state"
    key: "notification_dismissed"
    value: "true"
    type: "single_line_text_field"
  }]) {
    metafields { id value }
    userErrors { message }
  }
}
```

### **Show notification again:**
```graphql
mutation {
  metafieldsSet(metafields: [{
    namespace: "ui_state"
    key: "notification_dismissed"
    value: "false"
    type: "single_line_text_field"
  }]) {
    metafields { id value }
    userErrors { message }
  }
}
```

### **Check current status:**
```graphql
query {
  currentAppInstallation {
    metafields(namespace: "ui_state", key: "notification_dismissed") {
      nodes { value }
    }
  }
}
```

---

## ⚠️ **Notes:**
- Replace `gid://shopify/App/current` with your specific app ID if needed
- All mutations require `write_metafields` scope
- All queries require `read_metafields` scope
- Changes take effect immediately in the app 