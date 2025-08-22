<p align="center">
  <a href="https://keychain.org">
    <img width="500" src="https://github.com/user-attachments/assets/c059f450-f4fd-436d-a7aa-ad93cce69499" alt="keychain">
  </a>
</p>

---

## About

Keychain is a lightweight package designed to store sensitive variables securely in memory. Unlike traditional `.env` files, Keychain does not write secrets to disk, keeping them accessible only during runtime within your application.

---

## Features

- Memory-only secure storage.
- Handles strings, numbers, booleans, and objects.
- Fast and lightweight.
- Simple API for creating, reading, deleting, and listing keys.
- Random internal naming to prevent leaks.

---


---

## Usage

Import the package and use its API to store and retrieve variables safely. Keychain manages data internally and ensures secrets remain hidden from the disk.

---
