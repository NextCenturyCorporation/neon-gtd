'use strict';
/*
 * Copyright 2014 Next Century Corporation
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */
/**
 * This provides an Angular service for managing simple meta data about Neon Connection objects.
 *
 * @class neonDemo.services.ConnectionService
 * @constructor
 */
angular.module('neonDemo.services')
.factory('ConnectionService', function() {
    var activeConnection;

    var service = {};

    /**
     * Creates a Neon connection to the given host with the given database type.
     * @param {String} databaseType
     * @param {String} host
     * @method createActiveConnection
     * @return {neon.query.Connection}
     */
    service.createActiveConnection = function(databaseType, host) {
        if(!activeConnection || activeConnection.databaseType_ !== databaseType || activeConnection.host_ !== host) {
            activeConnection = new neon.query.Connection();
        }

        if(databaseType && host) {
            activeConnection.connect(databaseType, host);
        }

        return activeConnection;
    };

    /**
     * Returns the active connection.
     * @method getActiveConnection
     * @return {neon.query.Connection}
     */
    service.getActiveConnection = function() {
        return activeConnection;
    };

    return service;
});
