'use strict';

var _lodash = require('lodash');

var _sinon = require('sinon');

var _sinon2 = _interopRequireDefault(_sinon);

var _should_read_field_from_doc_values = require('./should_read_field_from_doc_values');

var shouldReadFieldFromDocValuesNS = _interopRequireWildcard(_should_read_field_from_doc_values);

var _utils = require('../../../../../utils');

var _field_caps_response = require('./field_caps_response');

var _es_field_caps_response = require('./__fixtures__/es_field_caps_response.json');

var _es_field_caps_response2 = _interopRequireDefault(_es_field_caps_response);

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

describe('index_patterns/field_capabilities/field_caps_response', () => {
  let sandbox;
  beforeEach(() => sandbox = _sinon2.default.sandbox.create());
  afterEach(() => sandbox.restore());

  describe('readFieldCapsResponse()', () => {
    describe('conflicts', () => {
      it('returns a field for each in response, no filtering', () => {
        const fields = (0, _field_caps_response.readFieldCapsResponse)(_es_field_caps_response2.default);
        expect(fields).toHaveLength(19);
      });

      it('includes only name, type, searchable, aggregatable, readFromDocValues, and maybe conflictDescriptions of each field', () => {
        const responseClone = (0, _lodash.cloneDeep)(_es_field_caps_response2.default);
        // try to trick it into including an extra field
        responseClone.fields['@timestamp'].date.extraCapability = true;
        const fields = (0, _field_caps_response.readFieldCapsResponse)(responseClone);

        fields.forEach(field => {
          if (field.conflictDescriptions) {
            delete field.conflictDescriptions;
          }

          expect(Object.keys(field)).toEqual(['name', 'type', 'searchable', 'aggregatable', 'readFromDocValues']);
        });
      });

      it('calls shouldReadFieldFromDocValues() for each non-conflict field', () => {
        sandbox.spy(shouldReadFieldFromDocValuesNS, 'shouldReadFieldFromDocValues');
        const fields = (0, _field_caps_response.readFieldCapsResponse)(_es_field_caps_response2.default);
        const conflictCount = fields.filter(f => f.type === 'conflict').length;
        _sinon2.default.assert.callCount(_should_read_field_from_doc_values.shouldReadFieldFromDocValues, fields.length - conflictCount);
      });

      it('converts es types to kibana types', () => {
        (0, _field_caps_response.readFieldCapsResponse)(_es_field_caps_response2.default).forEach(field => {
          if (!(0, _utils.getKbnFieldType)(field.type)) {
            throw new Error(`expected field to have kibana type, got ${field.type}`);
          }
        });
      });

      it('returns fields with multiple types as conflicts', () => {
        const fields = (0, _field_caps_response.readFieldCapsResponse)(_es_field_caps_response2.default);
        const conflicts = fields.filter(f => f.type === 'conflict');
        expect(conflicts).toEqual([{
          name: 'success',
          type: 'conflict',
          searchable: true,
          aggregatable: true,
          readFromDocValues: false,
          conflictDescriptions: {
            boolean: ['index1'],
            keyword: ['index2']
          }
        }]);
      });

      it('does not return conflicted fields if the types are resolvable to the same kibana type', () => {
        const fields = (0, _field_caps_response.readFieldCapsResponse)(_es_field_caps_response2.default);
        const resolvableToString = fields.find(f => f.name === 'resolvable_to_string');
        const resolvableToNumber = fields.find(f => f.name === 'resolvable_to_number');
        expect(resolvableToString.type).toBe('string');
        expect(resolvableToNumber.type).toBe('number');
      });

      it('returns aggregatable if at least one field is aggregatable', () => {
        const fields = (0, _field_caps_response.readFieldCapsResponse)(_es_field_caps_response2.default);
        const mixAggregatable = fields.find(f => f.name === 'mix_aggregatable');
        const mixAggregatableOther = fields.find(f => f.name === 'mix_aggregatable_other');
        expect(mixAggregatable.aggregatable).toBe(true);
        expect(mixAggregatableOther.aggregatable).toBe(true);
      });

      it('returns searchable if at least one field is searchable', () => {
        const fields = (0, _field_caps_response.readFieldCapsResponse)(_es_field_caps_response2.default);
        const mixSearchable = fields.find(f => f.name === 'mix_searchable');
        const mixSearchableOther = fields.find(f => f.name === 'mix_searchable_other');
        expect(mixSearchable.searchable).toBe(true);
        expect(mixSearchableOther.searchable).toBe(true);
      });
    });
  });
}); /* eslint import/no-duplicates: 0 */