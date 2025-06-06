# 🎯 Prosty Test Bannera Informacyjnego

## Banner pokazuje się gdy:
- Masz skonfigurowane produkty (masz już 3 produkty ✅)
- Nie zamknąłeś powiadomienia wcześniej

---

## 🔹 Pokaż banner informacyjny

**Użyj tego query w GraphiQL:**

```graphql
mutation ShowBanner {
  appInstallation {
    metafieldsDelete(
      namespace: "app_notifications"
    ) {
      deletedMetafields {
        key
      }
      userErrors {
        field
        message
      }
    }
  }
}
```

**Alternatywnie - wyczyść localStorage w przeglądarce:**

Otwórz Developer Tools (F12) w aplikacji i w konsoli wpisz:
```javascript
localStorage.removeItem('dc-auto-install-notification-dismissed');
location.reload();
```

---

## 🔹 Ukryj banner (zamknij powiadomienie)

Kliknij przycisk **X** w prawym górnym rogu bannera.

Lub użyj JavaScript w konsoli:
```javascript
localStorage.setItem('dc-auto-install-notification-dismissed', 'true');
location.reload();
```

---

## 🎯 Jak wygląda banner:

**Tytuł:** "Theme Setup Required"  
**Kolor:** Niebieski (info)  
**Tekst:** "To display external buttons on your product pages, add the "External Button" block to your theme (one-time setup)."  
**Przycisk:** "Add to Theme"  
**Zamknij:** Przycisk X w prawym górnym rogu

---

## ✅ To wszystko!

Teraz masz tylko jeden prosty banner informacyjny który:
- Pokazuje się gdy masz produkty 
- Można go zamknąć przyciskiem X
- Można go przywrócić czyszcząc localStorage
- Bez skomplikowanych statusów i metafields 