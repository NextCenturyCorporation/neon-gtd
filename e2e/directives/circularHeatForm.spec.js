'use strict';
/*
 * Copyright 2016 Next Century Corporation
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

describe('Directive: circularHeatForm', function() {
    // load the necessary modules
    beforeEach(module('neonDemo'));

    beforeEach(module('partials/directives/circularHeatForm.html'));

    var scope;
    var element;

    beforeEach(inject(function($compile, $rootScope) {
        scope = $rootScope;
        element = angular.element('<circular-heat-form></circular-heat-form>');
        $compile(element)(scope);
        element.scope().$digest();
    }));

    it('should initialize scope fields properly', function() {
        expect(element).not.toBeNull();
        expect(element.isolateScope().days.length).toBe(0);
        expect(element.isolateScope().timeofday.length).toBe(0);
        expect(element.isolateScope().maxDay).toBe('');
        expect(element.isolateScope().maxTime).toBe('');
    });
});
