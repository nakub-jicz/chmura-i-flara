# Simple GraphQL Queries for Testing Notifications

## 🔍 **Check notification status**
```graphql
query {
  currentAppInstallation {
    metafields(first: 10, namespace: "ui_state") {
      nodes { 
        key
        value 
      }
    }
  }
}
```

## ✅ **Hide notification**
```graphql
mutation {
  metafieldsSet(metafields: [{
    namespace: "ui_state"
    key: "notification_dismissed"
    value: "true"
    type: "single_line_text_field"
  }]) {
    metafields { value }
    userErrors { message }
  }
}
```

## 🔄 **Show notification again**
```graphql
mutation {
  metafieldsSet(metafields: [{
    namespace: "ui_state"
    key: "notification_dismissed"
    value: "false"
    type: "single_line_text_field"
  }]) {
    metafields { value }
    userErrors { message }
  }
}
```

## 🗑️ **Delete metafield (reset)**
```graphql
mutation {
  metafieldsDelete(metafields: [{
    namespace: "ui_state"
    key: "notification_dismissed"
  }]) {
    deletedMetafields { key }
    userErrors { message }
  }
}
```

---

**To use:** Copy any query above → Paste in GraphiQL → Run 