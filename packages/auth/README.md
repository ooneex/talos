# @talosjs/auth

Authentication framework with pluggable strategies for securing APIs and web applications -- supports token-based and session-based authentication flows.

![Bun](https://img.shields.io/badge/Bun-Compatible-orange?style=flat-square&logo=bun)
![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue?style=flat-square&logo=typescript)
![MIT License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)

## Features

✅ **Clerk Integration** - Built-in Clerk authentication client for user and session management

✅ **Token Verification** - Bearer token extraction and verification via Clerk backend

✅ **Auth Middleware** - Ready-to-use ClerkAuthMiddleware for protecting routes

✅ **User Management** - Get, update, ban, lock, unlock, and delete users through the Clerk API

✅ **Session Management** - Retrieve sessions and sign out users programmatically

✅ **User Metadata** - Read and update public, private, and unsafe metadata on user profiles

✅ **Profile Images** - Update and delete user profile images

✅ **Dependency Injection** - Injectable classes that integrate with the Talos DI container

✅ **Custom Exceptions** - AuthException with HTTP status codes for structured error handling
