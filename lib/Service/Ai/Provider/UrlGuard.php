<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\QuantumChess\Service\Ai\Provider;

/**
 * Checks the base URLs of LLM providers, so that the server cannot be used to reach internal services (server-side
 * request forgery).
 *
 * 1. URLs are normalised (lower-case scheme and host, no trailing slash) and must be http(s) without credentials,
 *    query or fragment.
 * 2. A URL is local when its host is localhost, a single-label name, *.local, or an address (literal or resolved)
 *    that is loopback, private, link-local, unique-local or otherwise reserved.
 * 3. Non-local URLs must use https.
 * 4. Local URLs are allowed only for the organisation provider with `shared_allow_local`, or for a personal provider
 *    whose normalised URL exactly equals an entry of `local_allowlist`.
 */
class UrlGuard {
	/**
	 * The normalised form of a base URL, or null when it is not acceptable at all.
	 */
	public function normalize(string $url): ?string {
		$url = trim($url);
		if ($url === '' || strlen($url) > 512 || preg_match('/[\s\x00-\x1f\x7f]/', $url) === 1) {
			return null;
		}
		$parts = parse_url($url);
		if ($parts === false || !isset($parts['scheme'], $parts['host'])) {
			return null;
		}
		$scheme = strtolower($parts['scheme']);
		if (!in_array($scheme, ['http', 'https'], true)) {
			return null;
		}
		if (isset($parts['user']) || isset($parts['pass']) || isset($parts['query']) || isset($parts['fragment'])
			|| str_contains($url, '@') || str_contains($url, '?') || str_contains($url, '#')) {
			return null;
		}
		$host = strtolower($parts['host']);
		if ($host === '' || preg_match('/^(\[[0-9a-f:.]+\]|[a-z0-9.-]+)$/', $host) !== 1) {
			return null;
		}
		$port = isset($parts['port']) ? ':' . $parts['port'] : '';
		$path = rtrim($parts['path'] ?? '', '/');
		if ($path !== '' && preg_match('#^(/[A-Za-z0-9._~%!$&\'()*+,;=:-]+)+$#', $path) !== 1) {
			return null;
		}
		return $scheme . '://' . $host . $port . $path;
	}

	/**
	 * Whether a normalised URL points to a local address (rule 2 above).
	 */
	public function isLocal(string $normalizedUrl): bool {
		$host = (string)parse_url($normalizedUrl, PHP_URL_HOST);
		$host = trim($host, '[]');
		if ($host === '' || $host === 'localhost' || str_ends_with($host, '.localhost')
			|| str_ends_with($host, '.local')) {
			return true;
		}
		if (filter_var($host, FILTER_VALIDATE_IP) !== false) {
			return self::isLocalIp($host);
		}
		if (!str_contains($host, '.')) {
			return true;
		}
		foreach ($this->resolve($host) as $ip) {
			if (self::isLocalIp($ip)) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Check a base URL for a scope. Returns the normalised URL and whether local addresses must be allowed for the
	 * request, or throws `url_not_allowed`.
	 *
	 * @param 'shared'|'personal' $scope
	 * @param list<string> $allowlist normalised `local_allowlist`
	 * @return array{url: string, allowLocal: bool}
	 * @throws UrlNotAllowedException
	 */
	public function check(string $url, string $scope, bool $sharedAllowLocal, array $allowlist): array {
		$normalized = $this->normalize($url);
		if ($normalized === null) {
			throw new UrlNotAllowedException('invalid');
		}
		if (!$this->isLocal($normalized)) {
			if (!str_starts_with($normalized, 'https://')) {
				throw new UrlNotAllowedException('https_required');
			}
			return ['url' => $normalized, 'allowLocal' => false];
		}
		if ($scope === 'shared' && $sharedAllowLocal) {
			return ['url' => $normalized, 'allowLocal' => true];
		}
		if ($scope === 'personal' && in_array($normalized, $allowlist, true)) {
			return ['url' => $normalized, 'allowLocal' => true];
		}
		throw new UrlNotAllowedException('local');
	}

	public static function isLocalIp(string $ip): bool {
		if (filter_var($ip, FILTER_VALIDATE_IP) === false) {
			return true;
		}
		if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4) !== false) {
			$long = ip2long($ip);
			// 100.64.0.0/10 (carrier-grade NAT) is not covered by the PHP filters
			if ($long !== false && ($long & 0xFFC00000) === (100 << 24 | 64 << 16)) {
				return true;
			}
			return filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) === false;
		}
		$packed = inet_pton($ip);
		if ($packed === false) {
			return true;
		}
		// IPv4-mapped IPv6 (::ffff:a.b.c.d)
		if (str_starts_with($packed, str_repeat("\0", 10) . "\xff\xff")) {
			$v4 = inet_ntop(substr($packed, 12));
			return $v4 === false || self::isLocalIp($v4);
		}
		$first = ord($packed[0]);
		$second = ord($packed[1]);
		if ($packed === str_repeat("\0", 15) . "\1" || $packed === str_repeat("\0", 16)
			|| ($first & 0xFE) === 0xFC                         // fc00::/7 unique local
			|| ($first === 0xFE && ($second & 0xC0) === 0x80)) { // fe80::/10 link-local
			return true;
		}
		return filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) === false;
	}

	/**
	 * Resolved addresses of a host name (A and AAAA). Protected so that tests can avoid DNS.
	 *
	 * @return list<string>
	 */
	protected function resolve(string $host): array {
		$ips = [];
		$v4 = @gethostbynamel($host);
		if (is_array($v4)) {
			$ips = $v4;
		}
		$records = @dns_get_record($host, DNS_AAAA);
		if (is_array($records)) {
			foreach ($records as $record) {
				if (isset($record['ipv6']) && is_string($record['ipv6'])) {
					$ips[] = $record['ipv6'];
				}
			}
		}
		return $ips;
	}
}
