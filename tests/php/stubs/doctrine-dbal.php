<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

// Minimal stand-ins for the Doctrine DBAL constants that OCP's database interfaces reference, so that unit tests can
// mock IDBConnection and IQueryBuilder without a Nextcloud server. Only loaded when Doctrine is absent.

namespace Doctrine\DBAL;

class ParameterType {
	public const NULL = 0;
	public const INTEGER = 1;
	public const STRING = 2;
	public const LARGE_OBJECT = 3;
	public const BOOLEAN = 5;
	public const BINARY = 16;
	public const ASCII = 17;
}

class ArrayParameterType {
	public const INTEGER = 101;
	public const STRING = 102;
	public const ASCII = 117;
	public const BINARY = 116;
}

class Connection {
	public const PARAM_INT_ARRAY = 101;
	public const PARAM_STR_ARRAY = 102;
}

namespace Doctrine\DBAL\Types;

class Types {
	public const BOOLEAN = 'boolean';
	public const DATE_MUTABLE = 'date';
	public const DATE_IMMUTABLE = 'date_immutable';
	public const DATETIME_MUTABLE = 'datetime';
	public const DATETIME_IMMUTABLE = 'datetime_immutable';
	public const DATETIMETZ_MUTABLE = 'datetimetz';
	public const DATETIMETZ_IMMUTABLE = 'datetimetz_immutable';
	public const TIME_MUTABLE = 'time';
}
