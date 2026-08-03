/**
 * `/app` is the tracking diagram — sources on the left, destinations on the
 * right. It replaced a legacy "Account Setup" page that was written when
 * PostHog was the only destination: that page duplicated every credential and
 * feature toggle already owned by the source and destination pages, so a
 * merchant could set the same value in two places and get two answers.
 *
 * ponytail: same page under two URLs beats a redirect plus a second component.
 */
export { clientLoader, HydrateFallback, default } from './app.tracking';
