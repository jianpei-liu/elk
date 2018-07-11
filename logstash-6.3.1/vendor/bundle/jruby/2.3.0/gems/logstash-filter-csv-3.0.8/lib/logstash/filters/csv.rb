# encoding: utf-8
require "logstash/filters/base"
require "logstash/namespace"

require "csv"

# The CSV filter takes an event field containing CSV data, parses it,
# and stores it as individual fields (can optionally specify the names).
# This filter can also parse data with any separator, not just commas.
class LogStash::Filters::CSV < LogStash::Filters::Base
  config_name "csv"

  # The CSV data in the value of the `source` field will be expanded into a
  # data structure.
  config :source, :validate => :string, :default => "message"

  # Define a list of column names (in the order they appear in the CSV,
  # as if it were a header line). If `columns` is not configured, or there
  # are not enough columns specified, the default column names are
  # "column1", "column2", etc. In the case that there are more columns
  # in the data than specified in this column list, extra columns will be auto-numbered:
  # (e.g. "user_defined_1", "user_defined_2", "column3", "column4", etc.)
  config :columns, :validate => :array, :default => []

  # Define the column separator value. If this is not specified, the default
  # is a comma `,`. If you want to define a tabulation as a separator, you need
  # to set the value to the actual tab character and not `\t`.
  # Optional.
  config :separator, :validate => :string, :default => ","

  # Define the character used to quote CSV fields. If this is not specified
  # the default is a double quote `"`.
  # Optional.
  config :quote_char, :validate => :string, :default => '"'

  # Define target field for placing the data.
  # Defaults to writing to the root of the event.
  config :target, :validate => :string

  # Define whether column names should autogenerated or not.
  # Defaults to true. If set to false, columns not having a header specified will not be parsed.
  config :autogenerate_column_names, :validate => :boolean, :default => true

  # Define whether the header should be skipped or not
  # Defaults to false, If set to true, the header is dropped
  config :skip_header, :validate => :boolean, :default => false

  # Define whether empty columns should be skipped.
  # Defaults to false. If set to true, columns containing no value will not get set.
  config :skip_empty_columns, :validate => :boolean, :default => false

  # Define whether empty rows could potentially be skipped.
  # Defaults to false. If set to true, rows containing no value will be tagged with _csvskippedemptyfield.
  # This tag can referenced by users if they wish to cancel events using an 'if' conditional statement.
  config :skip_empty_rows, :validate => :boolean, :default => false

  # Define a set of datatype conversions to be applied to columns.
  # Possible conversions are integer, float, date, date_time, boolean
  #
  # # Example:
  # [source,ruby]
  #     filter {
  #       csv {
  #         convert => {
  #           "column1" => "integer"
  #           "column2" => "boolean"
  #         }
  #       }
  #     }
  config :convert, :validate => :hash, :default => {}

  # Define whether column names should be auto-detected from the header column or not.
  # Defaults to false.
  config :autodetect_column_names, :validate => :boolean, :default => false

  CONVERTERS = {
    :integer => lambda do |value|
      CSV::Converters[:integer].call(value)
    end,

    :float => lambda do |value|
      CSV::Converters[:float].call(value)
    end,

    :date => lambda do |value|
      result = CSV::Converters[:date].call(value)
      result.is_a?(Date) ? LogStash::Timestamp.new(result.to_time) : result
    end,

    :date_time => lambda do |value|
      result = CSV::Converters[:date_time].call(value)
      result.is_a?(DateTime) ? LogStash::Timestamp.new(result.to_time) : result
    end,

    :boolean => lambda do |value|
       value = value.strip.downcase
       return false if value == "false"
       return true  if value == "true"
       return value
    end
  }
  CONVERTERS.default = lambda {|v| v}
  CONVERTERS.freeze

  def register
    # validate conversion types to be the valid ones.
    bad_types = @convert.values.select do |type|
      !CONVERTERS.has_key?(type.to_sym)
    end.uniq

    raise(LogStash::ConfigurationError, "Invalid conversion types: #{bad_types.join(', ')}") unless bad_types.empty?

    # @convert_symbols contains the symbolized types to avoid symbol conversion in the transform method
    @convert_symbols = @convert.inject({}){|result, (k, v)| result[k] = v.to_sym; result}

    # make sure @target is in the format [field name] if defined, i.e. surrounded by brakets
    @target = "[#{@target}]" if @target && !@target.start_with?("[")
    
    # if the zero byte character is entered in the config, set the value
    if (@quote_char == "\\x00")
      @quote_char = "\x00"
    end
    
    @logger.debug? && @logger.debug("CSV parsing options", :col_sep => @separator, :quote_char => @quote_char)
  end

  def filter(event)
    @logger.debug? && @logger.debug("Running csv filter", :event => event)

    if (source = event.get(@source))
      begin

        values = CSV.parse_line(source, :col_sep => @separator, :quote_char => @quote_char)        

        if (@autodetect_column_names && @columns.empty?)
          @columns = values
          event.cancel
          return
        end

        if (@skip_header && (!@columns.empty?) && (@columns == values))
          event.cancel
          return
        end

        if(@skip_empty_rows && values.nil?)
          # applies tag to empty rows, users can cancel event referencing this tag in an 'if' conditional statement
          event.tag("_csvskippedemptyfield")
          return
        end

        values.each_index do |i|
          unless (@skip_empty_columns && (values[i].nil? || values[i].empty?))
            unless ignore_field?(i)
              field_name = @columns[i] || "column#{i + 1}"
              event.set(field_ref(field_name), transform(field_name, values[i]))
            end
          end
        end

        filter_matched(event)
      rescue => e
        event.tag("_csvparsefailure")
        @logger.warn("Error parsing csv", :field => @source, :source => source, :exception => e)
        return
      end
    end

    @logger.debug? && @logger.debug("Event after csv filter", :event => event)
  end

  private

  # construct the correct Event field reference for given field_name, taking into account @target
  # @param field_name [String] the field name.
  # @return [String] fully qualified Event field reference also taking into account @target prefix
  def field_ref(field_name)
    if field_name.start_with?("[")
      "#{@target}#{field_name}"
    else
      "#{@target}[#{field_name}]"
    end
  end

  def ignore_field?(index)
    !@columns[index] && !@autogenerate_column_names
  end

  def transform(field_name, value)
    CONVERTERS[@convert_symbols[field_name]].call(value)
  end
end
